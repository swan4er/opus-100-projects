/* ================================================================
   Участковый · мастер игры
   Нейросеть здесь — мастер, актёры и секретарь:
   · decide()  — мастер решает ход строгим JSON: нужен ли бросок d20, что будет при успехе и провале;
   · speak()   — актёр играет персонажа, реплика идёт потоком;
   · quest()   — мастер придумывает бытовое заявление жителя (с рассуждением, в фоне);
   · call(), confession(), protocol() — звонки начальства и финал.
   Без ключа и сети всё это делает демо-режим на заготовках.
   ================================================================ */
window.U = window.U || {};

U.Master = (function () {
  'use strict';
  const E = U.Engine, D = U.DATA;
  const live = () => !!(window.AI && !AI.demo && !AI.shot && AI.hasKey());
  const S = () => E.S;

  const nameOf = (id) => (D.CHARS[id] ? D.CHARS[id].name : id);
  const locName = (id) => (D.LOCS[id] ? D.LOCS[id].name : id);

  // Нейросеть иногда пишет имя вместо id — приводим к id
  function charId(v) {
    if (!v || typeof v !== 'string') return null;
    const s = v.trim().toLowerCase();
    if (D.CHARS[s]) return s;
    for (const id in D.CHARS) {
      const c = D.CHARS[id];
      if (c.name.toLowerCase() === s || c.full.toLowerCase().includes(s) || s.includes(c.name.toLowerCase())) return id;
    }
    return null;
  }
  function locId(v) {
    if (!v || typeof v !== 'string') return null;
    const s = v.trim().toLowerCase();
    if (D.LOCS[s]) return s;
    for (const id in D.LOCS) if (D.LOCS[id].short.toLowerCase() === s || D.LOCS[id].name.toLowerCase().includes(s)) return id;
    return null;
  }

  // ---------- контекст для промптов ----------
  function condText(c) {
    if (c.need === 'free') return 'свободно, если спросят по теме';
    if (c.need === 'trust') return `доверие ≥ ${c.att || 0} или успех броска (${c.sk || 'обаяние'})`;
    return `только успех броска (${c.sk || 'сыск'}, ориентир dc ${c.dc || 12})`;
  }
  function presentLine(ctx) {
    const ids = ctx.present.filter((id) => !D.CHARS[id].phone);
    if (!ids.length) return 'никого';
    return ids.map((id) => {
      const c = D.CHARS[id];
      const a = S().att[id] || 0;
      return `${id} — ${c.full}, ${c.role}; отношение ${a} (${E.attLabel(a)})${E.asleep(id) ? '; СПИТ' : ''}`;
    }).join('\n');
  }
  function invLine() {
    return S().inv.map((id) => `${id} (${D.ITEMS[id].name})`).join(', ') || 'пусто';
  }
  function memLine(id) {
    const m = id && S().mem[id];
    return m && m.length ? m.slice(-5).join('; ') : '';
  }
  function rumorLine(n = 4) {
    return S().rumors.slice(-n).map((r) => r.text).join(' / ') || 'пока тихо';
  }
  function questLine() {
    const qs = S().quests.filter((q) => q.status === 'active');
    return qs.length ? qs.map((q) => `${q.id} «${q.title}» — от ${q.giver}, место ${q.where}; цель: ${q.goal}; разгадка: ${q.secret}`).join('\n') : 'нет';
  }
  function nightHere(ctx) {
    const sc = E.caseData(), h = E.clock().hour;
    return sc.nightAct.loc === ctx.loc && E.inNight(sc.nightAct, h) ? `ПРЯМО СЕЙЧАС ЗДЕСЬ ТАЙКОМ ПРОИСХОДИТ: ${sc.nightAct.text}. Заметить можно успешным броском сыска (улика witness).` : '';
  }

  const HINT = '{"type":"talk|act|search|move","to":"id собеседника или null","move":"id места или null","roll":null или {"sk":"обаяние|нажим|сыск|сноровка|бюрократия","dc":12,"why":"до 8 слов"},"ok":{"narr":"","dir":"","clue":null,"att":0,"auth":0,"money":0,"give":null,"take":null,"quest":null,"fx":null,"rumor":null,"memo":"","min":10},"no":{те же поля}}';

  function masterSystem(ctx) {
    const sc = E.caseData(), c = E.clock(), L = D.LOCS[ctx.loc];
    const clues = E.cluesHere(ctx);
    const clueTxt = clues.length
      ? clues.map((x) => `${x.id} — ${x.who[0] === '@' ? 'в этом месте (найти осмотром)' : 'знает ' + x.who}; условие: ${condText(x)}; тема: ${x.topic}; суть: ${x.text}`).join('\n')
      : 'здесь новых улик нет — персонажи отвечают по характеру, без новых фактов о краже';
    const toLine = ctx.phone ? 'polkan — полковник Полкан, по телефону' : ctx.to ? `${ctx.to} (${nameOf(ctx.to)})` : 'не выбран — выбери по смыслу из ЗДЕСЬ или null';
    return [
      'Ты — мастер настольной ролевой игры «Участковый». Жанр: добрая абсурдная комедия. В ПГТ Тридевятое сказочные жители живут обычной жизнью в наши дни. Игрок — новый участковый. Ты решаешь, что происходит после его действия. Учёт и правила держит код: ты предлагаешь, код проверяет.',
      `ПРАВДА О ДЕЛЕ (игроку прямо не раскрывать): ${sc.truth} Виновный: ${sc.culprit}. Его версия: «${sc.alibi}» Яйцо сейчас: ${sc.eggHide}.`,
      `ВСЕ ЗНАЮТ: ${D.PUBLIC}`,
      `СЕЙЧАС: ${c.weekday} ${c.hh}, ${c.phase}. Место: ${L.name} (${ctx.loc}). ${L.desc} Что тут можно обыскать: ${L.search}`,
      nightHere(ctx),
      `ЗДЕСЬ:\n${presentLine(ctx)}`,
      `СОБЕСЕДНИК: ${toLine}`,
      `УЧАСТКОВЫЙ: авторитет ${S().auth}/100, ${S().money} ₽, вещи: ${invLine()}.${E.drunk() ? ' Выпил пива — от него пахнет.' : ''}`,
      `УЛИКИ, ДОСТУПНЫЕ ЗДЕСЬ:\n${clueTxt}`,
      `ЗАЯВЛЕНИЯ ЖИТЕЛЕЙ:\n${questLine()}`,
      `СЛУХИ: ${rumorLine()}`,
      ctx.to && memLine(ctx.to) ? `ПАМЯТЬ СОБЕСЕДНИКА: ${memLine(ctx.to)}` : '',
      'ЭФФЕКТЫ СЦЕНЫ (fx): hut_turn — избушка поворачивается (аптека); fire — Горыныч пыхает огнём; splash — Водяной окатывает водой; smoke — клуб дыма; horn — гудок лесовоза; crows — взлетают вороны; shake — всё вздрагивает; stove — печь Емели подпрыгивает.',
      'КАК РЕШАТЬ:',
      '— type: talk — разговор; act — действие; search — осмотр или обыск; move — игрок хочет уйти в другое место (move = id места: square, dealership, pharmacy, banya, sawmill, shop).',
      '— roll: null, если исход очевиден: вопрос, приветствие, покупка, болтовня. Бросок d20 — когда есть сопротивление или риск: выведать скрываемое, надавить, уговорить упрямого, обыскать, заметить спрятанное, догнать, залезть, нырнуть. dc: 8 легко, 12 средне, 15 трудно, 18 почти невозможно.',
      '— ok — исход при успехе или без броска, no — при провале. narr — одно короткое предложение рассказчика о том, что видно со стороны (для обычной реплики пустое). dir — что персонаж ответит по сути и каким тоном, до 20 слов. clue — id улики из списка, если в этой ветке её узнают или находят, иначе null. att −2…2 — отношение собеседника. auth −3…3 — авторитет. money — взятки и штрафы, обычно 0. give — id вещи, которую участковый получает; take — id вещи, которую он отдаёт. quest — id заявления, если оно в этой ветке решено. rumor — одна фраза сплетни, если поступок участкового заметный, иначе null. memo — что собеседник запомнит, до 12 слов. min — сколько минут заняло, 5–120.',
      '— Условие «доверие ≥ N» выполнено, если отношение собеседника ≥ N. Если оно выполнено и игрок спрашивает по теме улики — roll: null, улика в ok. Если не выполнено — бросок (обаяние или нажим), улика только в ok. «Только успех броска» — только в ok с броском. «Свободно» — отдавай, как только спросят по теме. В ветке no улик нет.',
      '— В ветке no att обычно 0; −1 только за хамство, угрозы или неудачную наглость. Вежливый неудачный вопрос отношения не портит.',
      '— Не придумывай улик вне списка и не называй виновного. Виновный держится своей версии. Если игрок спрашивает не того, персонаж честно не знает или сплетничает.',
      '— Если участковый что-то отдаёт, дарит или угощает — take = id этой вещи из его вещей (иначе подарка нет). Если он получает вещь — give.',
      '— Жители живые: шутят, обижаются, торгуются, помнят слухи и прошлые встречи. Хамство портит отношение, любимое угощение улучшает. Взятка — пятно на репутации.',
    ].filter(Boolean).join('\n');
  }

  // Приводим ответ мастера к надёжной форме
  function normalize(raw, ctx) {
    if (!raw || typeof raw !== 'object') return null;
    const types = ['talk', 'act', 'search', 'move'];
    const dec = { type: types.includes(raw.type) ? raw.type : 'talk', to: null, move: locId(raw.move), roll: null, ok: {}, no: {} };
    const to = charId(raw.to);
    if (ctx.phone) dec.to = 'polkan';
    else if (to && ctx.present.includes(to)) dec.to = to;
    else if (ctx.to && dec.type === 'talk') dec.to = ctx.to;
    if (raw.roll && typeof raw.roll === 'object' && D.SKILLS[String(raw.roll.sk || '').toLowerCase()]) {
      dec.roll = { sk: String(raw.roll.sk).toLowerCase(), dc: E.clamp(Math.round(E.num(raw.roll.dc, 12)), 5, 20), why: E.str(raw.roll.why, 80) };
    }
    const br = (b) => {
      b = b && typeof b === 'object' ? b : {};
      return {
        narr: E.str(b.narr, 260), dir: E.str(b.dir, 260), clue: typeof b.clue === 'string' ? b.clue : null,
        att: E.num(b.att), auth: E.num(b.auth), money: E.num(b.money), give: typeof b.give === 'string' ? b.give : null,
        take: typeof b.take === 'string' ? b.take : null, quest: typeof b.quest === 'string' ? b.quest : null,
        fx: typeof b.fx === 'string' ? b.fx : null, rumor: typeof b.rumor === 'string' ? b.rumor : null, memo: E.str(b.memo, 160), min: E.num(b.min, 0) || undefined,
      };
    };
    dec.ok = br(raw.ok);
    const neutralNo = () => Object.assign(br(raw.ok), { clue: null, att: 0, auth: 0, money: 0, give: null, quest: null, narr: '', dir: 'Уклоняется от ответа, но без обиды.' });
    dec.no = raw.no ? br(raw.no) : neutralNo();
    dec.no.clue = null; // в ветке провала улик нет — это правило кода, а не просьба к мастеру
    // Правила держит код: если мастер хочет выдать улику, закрытую броском, а бросок забыл, — бросок назначает код
    const want = dec.ok.clue ? E.cluesHere(Object.assign({}, ctx, { to: dec.to || ctx.to })).find((c) => c.id === dec.ok.clue) : null;
    if (want && !dec.roll) {
      const trusted = want.need === 'trust' && (S().att[want.who] || 0) >= (want.att || 0);
      if (want.need === 'roll' || (want.need === 'trust' && !trusted)) {
        dec.roll = { sk: want.sk || (want.need === 'trust' ? 'обаяние' : 'сыск'), dc: E.clamp(want.dc || 12, 5, 20), why: want.who[0] === '@' || want.id === 'egg' ? 'Найти спрятанное' : 'Разговорить' };
        if (want.id === 'egg' || want.who[0] === '@') dec.type = 'search';
        if (!raw.no) dec.no = neutralNo();
        if (!dec.no.narr && (want.who[0] === '@' || want.id === 'egg')) dec.no.narr = 'Вы ищете добросовестно, но ничего стоящего не попадается.';
      }
    }
    if (dec.type === 'move' && !dec.move) dec.type = 'act';
    return dec;
  }

  // ---------- решение мастера ----------
  async function decide(text, ctx) {
    if (!live()) return demoDecide(text, ctx);
    const recent = S().recent.slice(-6).join('\n');
    const user = (recent ? 'НЕДАВНО:\n' + recent + '\n\n' : '') + 'ДЕЙСТВИЕ ИГРОКА: «' + text + '»';
    const t0 = performance.now();
    const raw = await AI.json([{ role: 'user', content: user }], { system: masterSystem(ctx), schemaHint: HINT, maxTokens: 650, temperature: 0.75, fallback: null });
    // для проверки: последние решения мастера и сколько они шли (в консоль не пишем)
    const log = (window.__uchDecisions = window.__uchDecisions || []);
    log.push({ text, ms: Math.round(performance.now() - t0), raw });
    if (log.length > 20) log.shift();
    const dec = normalize(raw, ctx);
    if (!dec) return demoDecide(text, ctx);
    // подарок держит код: вещь из кнопки «Угостить» или явное «угощаю пивом» уходит, даже если мастер забыл поле take
    const gift = giftOf(text, ctx.take);
    if (gift && dec.to && !dec.ok.take) dec.ok.take = gift;
    if (gift && dec.to && dec.roll && !dec.no.take) dec.no.take = gift;
    return dec;
  }
  function giftOf(text, explicit) {
    if (explicit && S().inv.includes(explicit)) return explicit;
    const t = String(text || '').toLowerCase();
    const item = ITEMW.find(([id, re]) => re.test(t) && S().inv.includes(id));
    return item && GIFT.test(t) ? item[0] : null;
  }

  // ---------- актёр ----------
  function actorSystem(id, dec, br, r, res, ctx, confess) {
    const c = D.CHARS[id], sc = E.caseData(), cl = E.clock();
    const a = S().att[id] || 0;
    const clue = res.clues.find((x) => x.who === id || x.who[0] === '@');
    const heads = id === 'gorynych' ? 'ФОРМАТ: отвечают головы, каждая с новой строки: «Го: …», «Ры: …», «Ныч: …». Две-три реплики, коротко.' : '';
    const truth = id === sc.culprit
      ? `ПРАВДА: это ты взял яйцо. ${sc.truth}` + (confess ? ' Сейчас ты признаёшься.' : ` Сам не признавайся. Держись версии: «${sc.alibi}»`)
      : c.night ? `ТВОЯ НОЧЬ: ${c.night}` : '';
    let order = br.dir || 'Ответь по характеру.';
    if (r) order += r.ok ? ' Участковый своего добился — бросок удался.' : ' У участкового не вышло — бросок провален.';
    if (br.clue && !clue) order = 'Уклонись: пошути или смени тему. Ничего нового по делу не говори.' + (r && !r.ok ? ' Участковый не смог тебя разговорить.' : '');
    return [
      'Ты играешь одного персонажа в комедийной ролевой игре «Участковый»: посёлок Тридевятое, сказочные жители живут обычной жизнью в наши дни. Отвечай только прямой речью своего персонажа: 1–3 коротких предложения, живой разговорный русский, юмор, своя манера. Без ремарок в скобках и звёздочках, без кавычек, без своего имени в начале. Не говори за участкового и не описывай его действия.',
      `ТЫ: ${c.full}, ${c.role}. ${c.persona}`,
      c.secret ? `ТВОЯ ТАЙНА (скрывай, отшучивайся): ${c.secret}` : '',
      truth,
      c.phone ? '' : `ОТНОШЕНИЕ К УЧАСТКОВОМУ: ${E.attLabel(a)}. ${memLine(id) ? 'ТЫ ПОМНИШЬ: ' + memLine(id) : 'Видишь его впервые или почти впервые.'}`,
      `СЛУХИ ПО ПОСЁЛКУ: ${rumorLine(3)}`,
      c.phone ? `СЕЙЧАС: ${cl.weekday} ${cl.hh}. Ты говоришь с участковым по телефону.` : `СЕЙЧАС: ${cl.weekday} ${cl.hh}, ${locName(ctx.loc)}.${E.asleep(id) ? ' Тебя только что разбудили, ты ворчишь.' : ''}`,
      `УКАЗАНИЕ МАСТЕРА: ${order}`,
      clue ? `В ЭТОЙ РЕПЛИКЕ ОБЯЗАТЕЛЬНО СКАЖИ СВОИМИ СЛОВАМИ: ${clue.text}` : 'Новых фактов о краже яйца не выдавай.',
      res.lost.length ? `Участковый тебе только что отдал: ${res.lost.map((x) => D.ITEMS[x].name).join(', ')}.` : '',
      heads,
    ].filter(Boolean).join('\n');
  }
  function clean(text, id) {
    let t = String(text || '').replace(/\*[^*]{0,120}\*/g, '').replace(/^\s*["«»“”]+|["«»“”]+\s*$/g, '').trim();
    const nm = D.CHARS[id] ? D.CHARS[id].name : '';
    if (nm) t = t.replace(new RegExp('^' + nm + '\\s*:\\s*', 'i'), '');
    if (id !== 'gorynych') t = t.replace(/^(Го|Ры|Ныч):\s*/gm, '');
    return t.trim();
  }
  async function speak(id, dec, br, r, res, ctx, text, onToken) {
    if (!live()) return demoSpeak(id, dec, br, r, res, ctx, text, onToken);
    const hist = (S().hist[id] || []).slice(-6);
    const narr = br.narr ? ` (${br.narr})` : '';
    const msgs = hist.concat([{ role: 'user', content: 'Участковый: «' + text + '»' + narr }]);
    const out = await AI.chat(msgs, { system: actorSystem(id, dec, br, r, res, ctx), maxTokens: 230, temperature: 0.9, onToken: (d, full) => onToken(clean(full, id)) });
    return clean(out, id);
  }

  // ---------- заявления жителей ----------
  // Заявление с рассуждением готовится ~20 с, поэтому следующее заранее ждёт в фоне
  let pending = null;
  function prefetchQuest() { if (live() && !pending) pending = genQuest().catch(() => null); }
  async function genQuest() {
    const used = S().quests.map((q) => q.title);
    const chars = Object.keys(D.CHARS).filter((id) => !D.CHARS[id].phone).map((id) => `${id} — ${D.CHARS[id].full}, ${D.CHARS[id].role}; тайна: ${D.CHARS[id].secret}`).join('\n');
    const c = E.clock();
    const sys = [
      'Ты — мастер комедийной ролевой игры «Участковый» (ПГТ Тридевятое, сказочные жители живут обычной жизнью в наши дни). Придумай ОДНО бытовое заявление жителя участковому: смешное, абсурдное, решаемое за 1–3 разговора. Не про кражу яйца Кощея. Опирайся на характеры и тайны жителей, слухи и время суток. Решение должно требовать поговорить с кем-то конкретным.',
      `ЖИТЕЛИ:\n${chars}`,
      'МЕСТА: square — площадь; dealership — автосалон; pharmacy — аптека; banya — баня; sawmill — лесной склад; shop — почта и магазин.',
      `СЕЙЧАС: ${c.weekday} ${c.hh}. СЛУХИ: ${rumorLine()}`,
      used.length ? `УЖЕ БЫЛИ: ${used.join('; ')}` : '',
    ].filter(Boolean).join('\n');
    return AI.json([{ role: 'user', content: 'Новое заявление.' }], {
      system: sys, think: true, maxTokens: 500, temperature: 0.95, fallback: null,
      schemaHint: '{"title":"до 4 слов","giver":"id жителя","where":"id места","text":"жалоба жителя, 1–2 предложения","goal":"что нужно сделать участковому","secret":"скрытая разгадка для мастера: кто или что на самом деле и у кого спросить"}',
    });
  }
  async function quest() {
    const used = S().quests.map((q) => q.title);
    if (!live()) {
      const pool = D.QUESTS.filter((q) => !used.includes(q.title));
      if (!pool.length) return null;
      const q = pool[(S().qn + S().turns) % pool.length];
      return E.addQuest(Object.assign({}, q, { done: { who: q.done.who, kw: q.done.kw.source } }));
    }
    let raw = null;
    if (pending) { raw = await pending; pending = null; }
    if (!raw || used.includes(raw.title)) raw = await genQuest();
    if (!raw || !charId(raw.giver)) {
      const pool = D.QUESTS.filter((q) => !used.includes(q.title));
      if (!pool.length) return null;
      const q = pool[0];
      return E.addQuest(Object.assign({}, q, { done: { who: q.done.who, kw: q.done.kw.source } }));
    }
    const q = E.addQuest({ title: raw.title, giver: charId(raw.giver), where: locId(raw.where) || E.whereIs(charId(raw.giver)), text: raw.text, goal: raw.goal, secret: raw.secret });
    prefetchQuest();
    return q;
  }

  // ---------- звонок Полкана ----------
  function nextHint() {
    const f = (id) => E.found(id);
    const sc = E.caseData();
    const scene = sc.clues.find((c) => c.who === '@dealership');
    const gory = sc.clues.find((c) => c.who === 'gorynych');
    const kiki = sc.clues.find((c) => c.who === 'kikimora');
    if (!f(scene.id)) return 'осмотри кабинет и сейф в автосалоне, внимательно';
    if (!f(gory.id)) return 'опроси охрану, Горыныча, по-хорошему — три головы, три показания';
    if (kiki && !f(kiki.id)) return 'Кикимора на почте знает всё про всех, найди к ней подход';
    if (!S().egg) return 'найди, где спрятано яйцо, и соберись с уликами';
    return 'хватит бегать, предъявляй обвинение';
  }
  function progressFacts() {
    const n = Object.keys(S().clues).length;
    const lg = S().log.slice(-4).map((l) => l.text).join(' ');
    return `Найдено улик: ${n}. Авторитет ${S().auth}/100. Пил на службе: ${S().flags.drinks || 0} раз. Взятки: ${S().flags.bribes || 0}. Ошибочных обвинений: ${S().accusations}. Последнее: ${lg} Слухи: ${rumorLine(3)}`;
  }
  async function call(day, onToken) {
    const lines = D.POLKAN_CALLS;
    if (!live()) return fake(lines[Math.min(day - 1, lines.length - 1)], onToken);
    const c = D.CHARS.polkan;
    const sys = [
      `Ты — ${c.full}. ${c.persona}`,
      'Ты звонишь участковому посёлка Тридевятое. Говори только прямой речью, 2–4 коротких предложения, без ремарок.',
      day === 1 ? `Это первый звонок: он только приехал. Не пересказывай всё подряд: одной фразой — у Кощея на юбилее из сейфа пропало яйцо, в нём его смерть; приказ — бегом в автосалон, осмотреть сейф и опросить охрану; срок — четверг, 9:00; и одна угроза в твоём стиле. Для справки: ${D.PUBLIC.split('. Кроме того')[0]}.` : `День ${day} из 3. Отреагируй на факты: похвали или наори. Подскажи направление: ${nextHint()}. Напомни срок — четверг, 9:00.`,
      `ФАКТЫ: ${progressFacts()}`,
      'Не называй подозреваемых, не делай выводов за участкового и не говори, где яйцо, — ты этого не знаешь.',
    ].join('\n');
    const out = await AI.chat([{ role: 'user', content: 'Участковый берёт трубку: «Слушаю!»' }], { system: sys, maxTokens: 200, temperature: 0.9, onToken: (d, full) => onToken(clean(full, 'polkan')) });
    return clean(out, 'polkan');
  }

  // ---------- финал ----------
  const CONFESS = {
    yaga: 'Ой, да ладно, ладно, соколик! Моё. Желтка хотела, капельку — капли мои выдохлись, а я на конкурс «Мисс Тридевятое» записалась. Убивать старого дурака не собиралась, двести лет с ним прожила — и так чуть не померла.',
    leshy: 'Ну ёлки… Я взял. Он лесовоз хотел забрать, а я без лесовоза — просто дерево. Положил в дуб, как в старину положено. Думал, спишет долг, я и верну. Ау, не сажай, а?',
    vodyanoy: 'Бульк… Я, голубчик. Вынырнул из аквариума, рыбок напугал, каюсь. Хотел выменять на пруд — куда мне без пруда, я ж водяной, а не водопроводный.',
    emelya: 'Так это… оно Кощеево было? А я думал, жар-птица вылупится. Я ж только яичницу загадал, а щука, видать, перестаралась. Щука, скажи ему! Молчит. Как всегда.',
  };
  async function confession(id, onToken) {
    const sc = E.caseData();
    if (!live()) return fake(CONFESS[sc.culprit], onToken);
    const res = { clues: [], lost: [] };
    const br = { dir: 'Тебя прижали уликами к стенке. Признайся — смешно и в своей манере, объясни мотив, пообещай вернуть яйцо. 3–4 предложения.' };
    const ctx = { loc: S().loc, present: [id], to: id };
    const found = Object.keys(S().clues).map((k) => E.clueById(k)).filter(Boolean).filter((c) => c.points === id).map((c) => c.text).join(' ');
    const out = await AI.chat([{ role: 'user', content: 'Участковый выкладывает улики: ' + found + ' «Признавайтесь, гражданин!»' }], { system: actorSystem(id, {}, br, null, res, ctx, true), maxTokens: 300, temperature: 0.9, onToken: (d, full) => onToken(clean(full, id)) });
    return clean(out, id);
  }
  function verdictText(kind) {
    const sc = E.caseData(), cul = D.CHARS[sc.culprit].full, f = !!D.CHARS[sc.culprit].fem;
    const V = f ? 'Виновная' : 'Виновный', nf = f ? 'не установлена' : 'не установлен';
    if (kind === 'best') return `Дело раскрыто. ${V} — ${cul}. Яйцо изъято участковым лично и возвращено гр. Кощею.`;
    if (kind === 'good') return `Дело раскрыто. ${V} — ${cul}. Яйцо ${f ? 'возвращено виновной' : 'возвращено виновным'} добровольно.`;
    if (kind === 'fired') return `Два ошибочных обвинения. ${f ? 'Настоящая виновная' : 'Настоящий виновный'} — ${cul} — ${nf}. Участковый переведён на Калинов мост.`;
    return `Срок истёк. ${V} — ${cul} — ${nf}. Кощей подал жалобу в район.`;
  }
  function protocolFallback(kind) {
    const lines = S().log.slice(-9).map((l, i) => `${i + 1}. ${E.clock(l.t).wd}, ${E.fmt(l.t)} — ${l.text}`);
    return lines.join('\n') + `\n\nИтог: ${verdictText(kind)}`;
  }
  async function protocol(kind, onToken) {
    if (!live()) return fake(protocolFallback(kind), onToken, 6);
    const journal = S().log.map((l) => `${E.clock(l.t).weekday} ${E.fmt(l.t)} — ${l.text}`).join('\n');
    const drinks = S().flags.drinks || 0;
    const sys = [
      'Ты — секретарь районного отдела полиции. Перепиши журнал участкового в итоговый протокол по делу № 1 «Кощеева смерть». Стиль — смешной казённый канцелярит с каменным лицом: «гр.», «в целях установления доверия», «произведено изъятие», «от дачи показаний не уклонялся».',
      drinks ? `Участковый пил пиво на службе (${drinks} раз) — это можно отметить: «в состоянии лёгкого пивного воодушевления».` : 'Участковый на службе не пил — выпивку ему не приписывай.',
      '5–9 пронумерованных пунктов, мелочи объединяй, самое нелепое оставляй. В каждом пункте — день недели и время из журнала. Бери только факты из журнала, ничего не добавляй. Последняя строка начинается с «Итог:». Без markdown и без заголовка.',
    ].join('\n');
    // модель иногда всё же ставит свой заголовок — снимаем его, «ПРОТОКОЛ» уже напечатан на бланке
    const tidy = (t) => t.replace(/\*\*/g, '').replace(/^\s*протокол[^\n]*\n+/i, '');
    const out = await AI.chat([{ role: 'user', content: `Вердикт: ${verdictText(kind)}\nЖурнал:\n${journal}` }], { system: sys, maxTokens: 900, temperature: 0.7, onToken: (d, full) => onToken(tidy(full)) });
    return tidy(out);
  }

  // ---------- демо-режим ----------
  function fake(text, onToken, speed = 16) {
    return new Promise((resolve) => {
      let i = 0;
      const step = () => {
        i = Math.min(text.length, i + 2 + Math.floor(Math.random() * 3));
        try { onToken && onToken(text.slice(0, i)); } catch {}
        if (i < text.length) setTimeout(step, speed + Math.random() * 20);
        else resolve(text);
      };
      setTimeout(step, 250);
    });
  }
  const MOVE = [
    ['pharmacy', /аптек|яг[аеиу]|избушк/], ['banya', /бан[юяеи]|пруд|водян/], ['dealership', /салон|кощ|горыныч|охран/],
    ['sawmill', /склад|лес[ау ]|лешы?[гемй]|леш[ие]|дуб/], ['shop', /почт|магаз|продукт|кикимор/], ['square', /площад|опорн|участок|кабинет|остановк|колобк/],
  ];
  const ITEMW = [['beer', /пив/], ['seeds', /семеч/], ['choco', /шокол/], ['bagels', /баранк/], ['kvass', /квас/], ['sourcream', /сметан/], ['valerian', /валерь/]];
  const GIFT = /дар|угоща|держи|возьми|бери|принёс|принес|для теб|для вас|вот |пей|ешь|налива|отдаю|вручаю/;
  const rot = {};
  function line(id, topic) {
    const set = (D.DEMO[id] && (D.DEMO[id][topic] || D.DEMO[id].other)) || ['…'];
    const k = id + topic;
    rot[k] = ((rot[k] ?? -1) + 1) % set.length;
    return set[rot[k]];
  }
  function blank() { return { narr: '', dir: '', clue: null, att: 0, auth: 0, money: 0, give: null, take: null, quest: null, fx: null, rumor: null, memo: '', min: 10 }; }
  function demoDecide(text, ctx) {
    const t = text.toLowerCase();
    const dec = { type: 'talk', to: ctx.phone ? 'polkan' : ctx.to, move: null, roll: null, ok: blank(), no: blank(), topic: 'other' };
    if (ctx.phone) { dec.topic = 'other'; return dec; }
    if (!dec.to) dec.to = ctx.present.find((id) => !E.asleep(id)) || ctx.present[0] || null;
    const go = /(^|\s)(иду|пойду|идём|пошли|отправляюсь|еду|поеду|направляюсь|схожу|зайду|загляну|двигаю|топаю)\s+(в|во|на|к|ко|до)\s/.test(t + ' ');
    if (go) {
      const mv = MOVE.find(([, re]) => re.test(t));
      if (mv && mv[0] !== ctx.loc) { dec.type = 'move'; dec.move = mv[0]; dec.to = null; return dec; }
    }
    const here = E.cluesHere(ctx);
    if (/обыск|осмотр|осматрив|ищу|поищ|загляд|провер|ныря|нырн|залез|шар|обшар|дупл|холодильн|под мостк|сейф/.test(t)) {
      dec.type = 'search'; dec.topic = 'search';
      const phys = here.filter((c) => c.who === '@' + ctx.loc || c.id === 'egg');
      const c = phys.find((x) => x.id === 'egg') || phys.find((x) => x.id !== 'witness') || phys[0];
      dec.roll = { sk: c ? c.sk || 'сыск' : 'сыск', dc: c ? c.dc || 12 : 10, why: 'Найти спрятанное' };
      dec.ok.clue = c ? c.id : null;
      dec.ok.narr = c ? (c.id === 'egg' ? 'Под руками что-то тяжёлое и холодное. Яйцо!' : 'Вы замечаете то, мимо чего прошли бы девять участковых из десяти.') : D.LOCS[ctx.loc].search + ' Ничего подозрительного.';
      dec.no.narr = 'Вы переворачиваете всё вверх дном — пусто. Хозяева смотрят косо.';
      if (dec.to) dec.no.att = -1;
      dec.ok.min = dec.no.min = 30;
      dec.to = null;
      return dec;
    }
    if (!dec.to) { dec.type = 'act'; dec.ok.narr = 'Вокруг ни души. Только ветер гоняет по асфальту фантик от «Жар-птицы».'; return dec; }
    const mine = here.filter((c) => c.who === dec.to);
    // что житель готов рассказать: по делу — сначала настоящие улики, в болтовне — сначала чужие грешки
    const open = (c, rolled) => c.need === 'free' || (c.need === 'trust' && ((S().att[dec.to] || 0) >= (c.att || 0) || rolled)) || (c.need === 'roll' && rolled);
    const pick = (rolled, gossip) => {
      const ok = mine.filter((c) => open(c, rolled));
      const real = ok.filter((c) => c.points), herr = ok.filter((c) => !c.points);
      return (gossip ? herr[0] || real[0] : real[0] || herr[0]) || null;
    };
    const item = ITEMW.find(([id, re]) => re.test(t) && S().inv.includes(id));
    if (item && GIFT.test(t)) {
      dec.topic = 'gift'; dec.ok.take = item[0]; dec.ok.att = 1; dec.ok.memo = 'Участковый угостил: ' + D.ITEMS[item[0]].name;
      dec.ok.clue = pick(false)?.id || null;
    } else if (/протокол|штраф|посажу|арест|задерж|угрож|признава|колись|сядешь|статья|закон|удостоверен/.test(t)) {
      dec.topic = 'threat'; dec.roll = { sk: /протокол|статья|закон/.test(t) ? 'бюрократия' : 'нажим', dc: 13, why: 'Надавить на собеседника' };
      dec.ok.clue = pick(true)?.id || null; dec.ok.att = -1; dec.no.att = -1; dec.ok.memo = 'Участковый давил и грозил'; dec.no.memo = 'Участковый грозил, но я не дрогнул';
      dec.ok.fx = dec.to === 'gorynych' ? 'fire' : null;
    } else if (/пожалуйста|прошу|помоги|дружищ|красав|душевн|по-хорошему|по секрету|между нами|бабул|голубчик|милая|уважаем|молодец|спасибо/.test(t)) {
      dec.topic = 'case'; dec.roll = { sk: 'обаяние', dc: 11, why: 'Расположить к себе' };
      dec.ok.clue = pick(true)?.id || null; dec.ok.att = 1; dec.ok.memo = 'Участковый был вежлив';
      dec.ok.fx = dec.to === 'yaga' && Math.random() < 0.5 ? 'hut_turn' : null;
    } else if (/ноч|где (ты|вы) был|алиби|вчера|праздник|юбиле|спал/.test(t)) {
      dec.topic = 'night'; dec.ok.clue = pick(false)?.id || null; dec.ok.memo = 'Спрашивал, где я был ночью';
    } else if (/яйц|сейф|смерт|игл|краж|украл|пропа|вор/.test(t)) {
      dec.topic = 'case'; dec.ok.clue = pick(false)?.id || null; dec.ok.memo = 'Спрашивал про яйцо';
    } else if (/привет|здравств|добр(ый|ое|ого)|здоров|здрасьте/.test(t)) {
      dec.topic = 'greet'; dec.ok.att = (S().att[dec.to] || 0) < 1 ? 1 : 0; dec.ok.memo = 'Познакомились';
    } else if (/слух|сплетн|кто|что (нового|слышно)|знаешь|видел|слышал/.test(t)) {
      dec.topic = 'other'; dec.ok.clue = pick(false, true)?.id || null;
    }
    for (const q of S().quests) {
      if (q.status === 'active' && q.done && q.done.who === dec.to && new RegExp(q.done.kw, 'i').test(t)) { dec.ok.quest = q.id; dec.ok.att += 1; }
    }
    return dec;
  }
  function demoSpeak(id, dec, br, r, res, ctx, text, onToken) {
    const clue = res.clues.find((x) => x.who === id);
    let out;
    if (clue) out = clue.say || clue.text;
    else if (res.quest) out = id === 'gorynych' ? 'Го: Разобрались!\nРы: Это я придумал.\nНыч: Любая беда — это просто заявление, которое ещё не закрыли.' : 'Ну спасибо, участковый. Век не забуду. Ну, лет сто точно.';
    else if (r && !r.ok) out = line(id, dec.topic === 'threat' ? 'threat' : 'other');
    else out = line(id, dec.topic || 'other');
    return fake(out, onToken);
  }

  return { decide, speak, quest, prefetchQuest, call, confession, protocol, verdictText, live, nextHint, fake, demoDecide };
})();
