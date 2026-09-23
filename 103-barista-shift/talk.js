/* ================================================================
   Смена — разговоры с нейросетью. Каждый клиент, шеф и дворник —
   отдельный персонаж DeepSeek. Модель получает правду о том, что
   реально налито в стакан, и отвечает репликой + JSON-решением.
   При любом сбое (нет ключа, нет сети, съёмка) — заготовки из DATA.DEMO.
   ================================================================ */
(function () {
  'use strict';
  const D = window.DATA;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const clampN = (x, a, b, def) => { const n = Number(x); return Number.isFinite(n) ? Math.max(a, Math.min(b, Math.round(n))) : def; };

  const Talk = { failures: 0, lastError: '' };
  window.Talk = Talk;
  const live = () => window.AI && !AI.demo && !AI.shot;

  const WORLD = 'Это комедийная игра «Смена». Кофейный киоск «Бодрячок» на улице Строителей, спальный район, конец октября, первый снег, утро буднего дня. Бариста — молодой парень, вчера гулял на дне рождения друга, сегодня помятый и с похмелья. Хозяин киоска — Вадим Игоревич. Все персонажи вымышленные жители района. Пиши живым разговорным русским языком, коротко и смешно, как говорят люди в очереди в семь утра. Без мата и без «твою мать» (ругаться можно так: «блин», «ёлки», «ёлки-палки», «офигеть»), без эмодзи, без звёздочек и ремарок в скобках. Никогда не упоминай, что ты ИИ или персонаж игры.';

  // ---------- разбор «РЕПЛИКА: … JSON: {…}» ----------
  function cleanSay(full) {
    let t = String(full || '');
    const b = t.indexOf('{');
    if (b >= 0) {
      const e = t.lastIndexOf('}');
      t = e > b ? t.slice(0, b) + ' ' + t.slice(e + 1) : t.slice(0, b);
    }
    t = t.replace(/```(?:json)?/gi, '').replace(/JSON\s*:?/gi, '').replace(/РЕПЛИКА\s*:?/gi, '');
    t = t.replace(/\s(J|JS|JSO|Р|РЕ|РЕП|РЕПЛ|РЕПЛИ|РЕПЛИК)$/, '');   // хвост метки, пока она ещё печатается
    t = t.replace(/\*[^*]{0,60}\*/g, '').replace(/\([^)]{0,80}\)/g, '');
    return t.replace(/\s+/g, ' ').trim().replace(/^["«„]+|["»“]+$/g, '').trim();
  }
  Talk.cleanSay = cleanSay;

  async function streamSay(messages, opts, onText) {
    let shown = '';
    const full = await AI.chat(messages, {
      ...opts,
      onToken: (d, f) => { const s = cleanSay(f); if (s !== shown) { shown = s; try { onText && onText(s); } catch (e) {} } },
    });
    const say = cleanSay(full);
    if (onText) onText(say);
    return { full, say, obj: AI.extractJSON(full) };
  }

  // Имитация потока для заготовок: печатаем по словам
  function fakeStream(text, onText, speed = 38) {
    return new Promise((res) => {
      if (!onText) return res(text);
      if (window.__SHOT__) { onText(text); return res(text); } // медленный рендер съёмки: сразу целиком
      const words = text.split(' ');
      let i = 0;
      const tick = () => { i++; onText(words.slice(0, i).join(' ')); if (i < words.length) setTimeout(tick, speed + Math.random() * 40); else res(text); };
      setTimeout(tick, 250);
    });
  }
  Talk.fakeStream = fakeStream;

  function fail(e) {
    Talk.failures++; Talk.lastError = (e && (e.ru || e.message)) || 'ошибка';
    if (Talk.onFail) Talk.onFail(Talk.lastError, e);
  }

  // ================================================================
  // Клиенты
  // ================================================================
  function customerSystem(c) {
    const a = c.arch;
    let s = WORLD + `\n\nТы — ${a.name}, ${a.age} лет, ${a.who}. Характер: ${a.temper}. Манера речи: ${a.speech}.`;
    if (c.dayNote) s += ` Сегодня утром: ${c.dayNote}.`;
    if (c.secret) s += '\n' + D.SHOPPER_NOTE;
    s += '\nГовори только от своего лица, обращайся к бариста. Коротко: 1–2 предложения, до 200 знаков.';
    return s;
  }

  function demoOrderLine(c) {
    const L = c.arch.demoOrder;
    let line = c.arch.orders.length > 1 ? (L[c.oi] || `Мне ${c.orderRu}. Имя — ${c.cupName}.`) : pick(L);
    if (c.secret) line += pick([' И чек, пожалуйста.', ' А зерно у вас какой обжарки?', ' А карта лояльности у вас есть?']);
    return line;
  }
  Talk.order = async function (c, ctx, onText) {
    const orderRu = ctx.orderText;
    if (!live()) {
      const line = demoOrderLine(c);
      return { say: await fakeStream(line, onText) };
    }
    const f = !!c.arch.fem, g = (m, w) => (f ? w : m);
    const u = `Время ${ctx.time}. Ты ${g('подошёл', 'подошла')} к окошку киоска.${ctx.waited > 1 ? ` ${g('Стоял', 'Стояла')} в очереди ${ctx.waited} мин.` : ''}${ctx.seen ? ` Пока ${g('стоял', 'стояла')}, ${g('видел', 'видела')}: ${ctx.seen}.` : ''} Бариста на вид: ${ctx.look}.\nСкажи бариста свой заказ в своей манере. Заказ строго такой, ничего не добавляй и не меняй: ${orderRu}. Если бариста спросит имя для стакана — ты ${c.cupName}.\nТолько реплика, 1–2 фразы.`;
    c.msgs = [{ role: 'system', content: customerSystem(c) }, { role: 'user', content: u }];
    try {
      const r = await streamSay(c.msgs, { maxTokens: 140, temperature: .95 }, onText);
      c.msgs.push({ role: 'assistant', content: r.say });
      return { say: r.say || demoOrderLine(c) };
    } catch (e) {
      fail(e);
      const line = demoOrderLine(c);
      c.msgs = null;
      return { say: await fakeStream(line, onText) };
    }
  };

  const ACTS = ['пьёт', 'уносит', 'выбрасывает', 'выливает', 'возвращает'];
  const MOODS = ['доволен', 'нейтрально', 'зол', 'в шоке', 'в восторге'];
  const norm = (x) => String(x || '').toLowerCase().replace(/ё/g, 'е').trim();
  const oneOf = (x, list) => list.find((v) => norm(v) === norm(x)) || null;
  function normDecision(o, ev, c, price) {
    o = o && typeof o === 'object' ? o : {};
    if (o.act) o.act = oneOf(o.act, ACTS) || o.act;
    if (o.mood) o.mood = oneOf(o.mood, MOODS) || o.mood;
    if (typeof o.pays === 'string') o.pays = norm(o.pays) === 'true' || norm(o.pays) === 'да';
    if (typeof o.complain === 'string') o.complain = norm(o.complain) === 'true' || norm(o.complain) === 'да';
    const q = ev.q;
    const defStars = q >= 8.5 ? 5 : q >= 7 ? 4 : q >= 5 ? 3 : q >= 3 ? 2 : 1;
    const stars = clampN(o.stars, 1, 5, defStars);
    let pays = typeof o.pays === 'boolean' ? o.pays : (o.pays === 'false' ? false : q >= 2.5);
    const tip = pays ? clampN(o.tip, 0, 300, stars >= 5 ? c.arch.tip : stars >= 4 ? Math.round(c.arch.tip / 2) : 0) : 0;
    let act = ACTS.includes(o.act) ? o.act : (q >= 5 ? 'пьёт' : q >= 3 ? 'уносит' : 'выбрасывает');
    const mood = MOODS.includes(o.mood) ? o.mood : (stars >= 5 ? 'в восторге' : stars >= 4 ? 'доволен' : stars >= 3 ? 'нейтрально' : q < 1.5 ? 'в шоке' : 'зол');
    const complain = typeof o.complain === 'boolean' ? o.complain : stars <= 1 && c.arch.strict > .5;
    let review = typeof o.review === 'string' && o.review.trim().length > 3 ? o.review.trim().slice(0, 260) : '';
    const report = typeof o.report === 'string' ? o.report.trim().slice(0, 300) : '';
    return { stars, pays, tip, act, mood, complain, review, report };
  }

  function demoReaction(c, ev) {
    const q = ev.q;
    const tier = q >= 8.5 ? 'great' : q >= 6.5 ? 'good' : q >= 4.5 ? 'meh' : q >= 2 ? 'bad' : 'awful';
    let say = pick(D.DEMO.react[tier]);
    const fl = ev.flags.find((f) => D.DEMO.flag[f]);
    if (fl) say = pick(D.DEMO.flag[fl]).replace('{name}', ev.cupName || '') + ' ' + (q < 5 ? say : '');
    if (ev.baristaSmell && Math.random() < .5) say += ' ' + pick(D.DEMO.flag.beerBreath);
    const stars = q >= 8.5 ? 5 : q >= 7 ? 4 : q >= 5 ? 3 : q >= 3 ? 2 : 1;
    const act = q >= 5 ? 'пьёт' : q >= 3 ? 'уносит' : ev.flags.includes('kefir') || ev.flags.includes('salt') ? 'выливает' : 'выбрасывает';
    let review = pick(D.DEMO.review[stars]);
    if (fl && D.DEMO.flag[fl]) review = pick(D.DEMO.flag[fl]).replace('{name}', ev.cupName || '') + ' ' + review;
    const report = c.secret ? D.DEMO.shopperReport.replace('{wait}', ev.wait).replace('{q}', q.toFixed(1)).replace('{std}', ev.std) : '';
    return { say: say.trim(), obj: { stars, act, tip: stars >= 4 ? c.arch.tip : 0, pays: q >= 2.5, review, complain: stars <= 1 && c.arch.strict > .5, report } };
  }

  Talk.react = async function (c, ev, ctx, onText) {
    const fields = '{"stars":1-5,"tip":0-300,"pays":true|false,"act":"пьёт"|"уносит"|"выбрасывает"|"выливает"|"возвращает","complain":true|false,"mood":"доволен"|"нейтрально"|"зол"|"в шоке"|"в восторге","review":"отзыв на картах от первого лица, 1–2 предложения"' + (c.secret ? ',"report":"официальный отчёт тайного покупателя для головного офиса, 1–2 сухих предложения с оценкой"' : '') + '}';
    const g = (m, w) => (c.arch.fem ? w : m);
    const u = `Бариста отдал тебе напиток${ctx.remake ? ' (это уже вторая попытка)' : ''}. Ты его видишь, держишь в руке и пробуешь. Правда о том, что ты получил (реагируй как живой человек: замечай то, что видно и чувствуется на вкус, можешь догадаться о причинах):\n${ev.truth}\nОбъективное качество напитка: ${ev.q.toFixed(1)} из 10. Цена ${ctx.price} ₽. Ты ${g('ждал', 'ждала')} ${ctx.wait} мин.\n\nФормат ответа строго такой, две строки:\nРЕПЛИКА: что ты говоришь бариста прямо сейчас, 1–3 предложения\nJSON: ${fields}\nact «возвращает» — требуешь переделать; complain — пожалуешься начальнику; pays=false — отказываешься платить.`;
    if (!live() || !c.msgs) {
      const r = demoReaction(c, ev);
      const say = await fakeStream(r.say, onText);
      return { say, dec: normDecision(r.obj, ev, c, ctx.price), full: say };
    }
    c.msgs.push({ role: 'user', content: u });
    try {
      const r = await streamSay(c.msgs, { maxTokens: 380, temperature: .9 }, onText);
      c.msgs.push({ role: 'assistant', content: r.full.slice(0, 900) });
      const dec = normDecision(r.obj, ev, c, ctx.price);
      if (!r.say) { const d = demoReaction(c, ev); onText && onText(d.say); return { say: d.say, dec }; }
      return { say: r.say, dec };
    } catch (e) {
      fail(e);
      const r = demoReaction(c, ev);
      c.msgs = null;
      const say = await fakeStream(r.say, onText);
      return { say, dec: normDecision(r.obj, ev, c, ctx.price) };
    }
  };

  Talk.reply = async function (c, ev, ctx, playerLine, onText, prev) {
    const u = `Бариста ответил тебе: «${playerLine}»${ctx.slurred ? ' (язык у него заплетается, от него пахнет пивом)' : ''}.${ctx.free ? ' И отдал напиток бесплатно, за счёт заведения.' : ''} Отреагируй коротко и прими окончательное решение.\nФормат тот же, две строки: РЕПЛИКА: … JSON: {…те же поля…}`;
    if (!live() || !c.msgs) {
      const q = ev.q;
      let say;
      if (ctx.free) say = q >= 4 ? 'Ну… спасибо, раз так. Хоть что-то приятное с утра.' : 'Бесплатно? Ну это хотя бы честно. Но пить я это не буду.';
      else if (/авторск|задумано|рецепт/i.test(playerLine)) say = q >= 5 ? 'Авторский, говоришь? Ладно, автор, живи.' : 'Автору надо бы руки оторвать. Авторские.';
      else if (/извин|прост/i.test(playerLine)) say = 'Ладно, бывает. Но осадочек остался.';
      else say = q >= 5 ? 'Ну ты даёшь. Ладно, хорошего дня.' : 'Я это запомню. И отзыв напишу.';
      say = await fakeStream(say, onText);
      const o = { ...prev };
      if (ctx.free) { o.pays = false; o.stars = Math.min(5, o.stars + 1); o.tip = 0; }
      else if (/извин|прост/i.test(playerLine)) o.stars = Math.min(5, o.stars + (q > 3 ? 1 : 0));
      else if (!/авторск|задумано|рецепт/i.test(playerLine) && q < 5) o.stars = Math.max(1, o.stars - 1);
      return { say, dec: o };
    }
    c.msgs.push({ role: 'user', content: u });
    try {
      const r = await streamSay(c.msgs, { maxTokens: 340, temperature: .9 }, onText);
      c.msgs.push({ role: 'assistant', content: r.full.slice(0, 700) });
      const dec = normDecision(r.obj ? { ...prev, ...r.obj } : prev, ev, c, ctx.price);
      if (ctx.free) { dec.pays = false; dec.tip = 0; }
      return { say: r.say || '…', dec };
    } catch (e) {
      fail(e);
      const say = await fakeStream('Ладно. Всё с тобой ясно.', onText);
      return { say, dec: prev };
    }
  };

  // отзыв ушедшего из очереди
  Talk.leftReview = async function (c, ctx) {
    const def = { stars: c.arch.strict > .5 ? 1 : 2, review: pick(D.DEMO.leftQueue) };
    if (!live()) return def;
    try {
      const o = await AI.json([{ role: 'system', content: customerSystem(c) }, { role: 'user', content: c.arch.fem ? `Ты ушла из очереди к киоску, так и не получив кофе. Причина: ${ctx.reason}. Ждала ${ctx.wait} мин. Что видела: ${ctx.seen || 'ничего особенного'}. Напиши короткий злой или ироничный отзыв на картах от первого лица, в своей манере.` : `Ты ушёл из очереди к киоску, так и не получив кофе. Причина: ${ctx.reason}. Ждал ${ctx.wait} мин. Что видел: ${ctx.seen || 'ничего особенного'}. Напиши короткий злой или ироничный отзыв на картах от первого лица, в своей манере.` }],
        { maxTokens: 160, schemaHint: '{"stars":1-5,"review":"1–2 предложения"}', fallback: def });
      return { stars: clampN(o.stars, 1, 5, def.stars), review: typeof o.review === 'string' && o.review.trim() ? o.review.trim().slice(0, 240) : def.review };
    } catch (e) { fail(e); return def; }
  };

  // реплика из очереди
  Talk.chatter = async function (c, ctx) {
    const canned = ctx.kind && D.DEMO['chatter' + ctx.kind] ? D.DEMO['chatter' + ctx.kind] : D.DEMO.chatter;
    if (!live() || !ctx.event) return pick(canned);
    try {
      const t = await AI.chat([{ role: 'system', content: customerSystem(c) }, { role: 'user', content: `Ты стоишь в очереди к киоску уже ${ctx.wait} мин. Только что: ${ctx.event}. Скажи короткую реплику себе под нос или соседу по очереди (до 90 знаков). Только реплика.` }], { maxTokens: 60, temperature: 1 });
      return cleanSay(t).slice(0, 140) || pick(canned);
    } catch (e) { fail(e); return pick(canned); }
  };

  // ================================================================
  // Шеф
  // ================================================================
  const BOSS = WORLD + '\n\nТы — Вадим Игоревич, 44 года, владелец трёх киосков «Бодрячок» по франшизе. Прошёл курс «Бизнес-лидер за 7 дней» и обожает словечки «клиентоориентированность», «воронка», «мы — семья», «точка роста», «NPS». Сначала пытаешься быть душевным коучем, но быстро срываешься на крик. Панически боишься головного офиса и тайных покупателей. Под прилавком стоит твой ящик пива «Серёже на юбилей» — если узнаешь, что бариста его пьёт, взбесишься. Ты звонишь бариста по телефону. Говори 1–3 предложения, до 260 знаков.';

  function bossFacts(ctx) {
    const rv = ctx.reviews.slice(-3).map((r) => `${r.stars}★ «${r.text.slice(0, 110)}»`).join('; ') || 'новых нет';
    return `Сейчас ${ctx.time}. Твоя злость: ${ctx.rage} из 100. Выручка ${ctx.cash} ₽ при плане 3500 ₽ к 9:00. Обслужено ${ctx.served}, ушли не дождавшись ${ctx.lost}, в очереди сейчас ${ctx.queue} чел. Рейтинг на картах ${ctx.rating} (утром был 4,1). Свежие отзывы: ${rv}. Жалобы тебе лично: ${ctx.complaints.slice(-2).join('; ') || 'нет'}. Твоих пропущенных звонков подряд: ${ctx.missed}.${ctx.smokeMin ? ` Бариста за смену курил в сумме ${ctx.smokeMin} мин.` : ''}`;
  }
  Talk.bossOpen = async function (ctx, onText) {
    const reason = ctx.reason;
    const demoLine = () => {
      const B = D.DEMO.boss;
      let l = reason === 'intro' ? pick(B.intro) : ctx.missed >= 2 ? pick(B.furious) : ctx.rage >= 70 ? pick(B.furious) : ctx.rage >= 35 ? pick(B.annoyed) : pick(B.calm);
      const last = ctx.reviews[ctx.reviews.length - 1];
      return l.replace('{cash}', ctx.cash + ' ₽').replace('{time}', ctx.time).replace('{review}', last ? last.text.slice(0, 50) : 'так себе');
    };
    if (!live()) return { say: await fakeStream(demoLine(), onText), msgs: null };
    const why = { intro: 'Первый звонок в начале смены: убедись, что киоск открыт, напомни про план 3500 ₽ и предупреди, что по району ходит тайный покупатель от головного офиса.', check: 'Плановая проверка, как идут дела.', complaint: 'Тебе только что пожаловался клиент — разберись.', review: 'Ты увидел свежий плохой отзыв на картах.', lost: 'Ты узнал, что люди уходят из очереди.', missed: 'Бариста не взял трубку в прошлый раз, ты перезваниваешь.', final: 'Скоро конец смены, ты едешь за выручкой.' }[reason] || 'Проверка.';
    const msgs = [{ role: 'system', content: BOSS }, { role: 'user', content: bossFacts(ctx) + `\nПовод звонка: ${why}\nФормат ответа строго такой:\nРЕПЛИКА: что ты говоришь в трубку\nJSON: {"rage":0-100}` }];
    try {
      const r = await streamSay(msgs, { maxTokens: 260, temperature: .9 }, onText);
      msgs.push({ role: 'assistant', content: r.full.slice(0, 700) });
      return { say: r.say || demoLine(), rage: r.obj ? clampN(r.obj.rage, 0, 100, ctx.rage) : ctx.rage, msgs };
    } catch (e) { fail(e); return { say: await fakeStream(demoLine(), onText), msgs: null }; }
  };
  Talk.bossReply = async function (ctx, msgs, playerLine, onText) {
    const bad = /вадик|пош[её]л|увольня|отстань|достал|не начинай/i.test(playerLine);
    if (!live() || !msgs) {
      let l = ctx.slurred && Math.random() < .6 ? pick(D.DEMO.boss.drunk) + ' ' : '';
      l += bad ? pick(D.DEMO.boss.replyBad) : pick(D.DEMO.boss.replyOk);
      return { say: await fakeStream(l, onText), rage: Math.min(100, ctx.rage + (bad ? 18 : ctx.slurred ? 10 : -4)), coming: false };
    }
    msgs.push({ role: 'user', content: `Бариста ответил в трубку: «${playerLine}»${ctx.slurred ? ' (голос заплетается — похоже, пьяный)' : ''}${ctx.noise ? `. На фоне слышно: ${ctx.noise}` : ''}. Ответь и закончи разговор.\nФормат: РЕПЛИКА: … JSON: {"rage":0-100,"coming":true|false} (coming — выезжаешь в киоск разбираться лично; только если совсем край).` });
    try {
      const r = await streamSay(msgs, { maxTokens: 240, temperature: .9 }, onText);
      const o = r.obj || {};
      return { say: r.say || '…', rage: clampN(o.rage, 0, 100, ctx.rage), coming: o.coming === true };
    } catch (e) { fail(e); return { say: await fakeStream(pick(D.DEMO.boss.replyOk), onText), rage: ctx.rage, coming: false }; }
  };

  // ================================================================
  // Дворник за киоском
  // ================================================================
  const JAN = WORLD + '\n\nТы — дворник Ильдар, 61 год, философ двора. Метёшь снег за киоском, всё про всех знаешь. Говоришь неторопливо, с житейской мудростью и неожиданными сравнениями. 1–2 предложения, до 200 знаков.';
  Talk.janitor = async function (ctx, onText) {
    if (!live()) return { say: await fakeStream(pick(D.DEMO.janitor), onText), msgs: null };
    const msgs = [{ role: 'system', content: JAN }, { role: 'user', content: `Бариста вышел покурить за киоск, сейчас ${ctx.time}. Его состояние: ${ctx.state}. Из-за угла слышно, как ругается очередь (${ctx.queue} чел.). Скажи ему что-нибудь.` }];
    try { const r = await streamSay(msgs, { maxTokens: 150, temperature: 1 }, onText); msgs.push({ role: 'assistant', content: r.say }); return { say: r.say, msgs }; }
    catch (e) { fail(e); return { say: await fakeStream(pick(D.DEMO.janitor), onText), msgs: null }; }
  };
  Talk.janitorReply = async function (msgs, line, onText) {
    if (!live() || !msgs) return { say: await fakeStream(pick(D.DEMO.janitorReply), onText) };
    msgs.push({ role: 'user', content: `Бариста ответил: «${line}». Ответь коротко.` });
    try { const r = await streamSay(msgs, { maxTokens: 130, temperature: 1 }, onText); return { say: r.say }; }
    catch (e) { fail(e); return { say: await fakeStream(pick(D.DEMO.janitorReply), onText) }; }
  };

  // ================================================================
  // Утро района: у каждого клиента своя история дня
  // ================================================================
  Talk.dayNotes = async function (list, shopperId) {
    if (!live()) return {};
    const people = list.map((c) => `${c.id}: ${c.arch.name}, ${c.arch.age}, ${c.arch.who}`).join('\n');
    try {
      const o = await AI.json([{ role: 'system', content: WORLD }, { role: 'user', content: `Для каждого жителя придумай, что с ним случилось сегодня утром до кофе: одна конкретная бытовая смешная деталь до 90 знаков (без упоминания кофе и киоска). Жители:\n${people}` }],
        { maxTokens: 1500, temperature: 1, schemaHint: '{"notes":{"<id>":"деталь"}}', fallback: {} });
      const out = {};
      if (o && o.notes && typeof o.notes === 'object') for (const k in o.notes) if (typeof o.notes[k] === 'string') out[k] = o.notes[k].slice(0, 140);
      return out;
    } catch (e) { fail(e); return {}; }
  };

  // ================================================================
  // Вердикт шефа (с рассуждением)
  // ================================================================
  const VERDICTS = ['уволен', 'штраф', 'выговор', 'нормально', 'премия'];
  Talk.verdict = async function (ctx) {
    const local = () => {
      let v = 'нормально';
      const score = ctx.cash / 3500 * 40 + (ctx.ratingNum - 3.5) * 25 - ctx.lost * 4 - ctx.beerDrunk * 5 - ctx.complaints.length * 6 - ctx.missed * 3 - ctx.smokeMin * .3 + (ctx.shopperQ - 5) * 3;
      if (ctx.asleep || score < -10) v = 'уволен'; else if (score < 8) v = 'штраф'; else if (score < 20) v = 'выговор'; else if (score > 42) v = 'премия';
      const key = { 'уволен': 'fired', 'штраф': 'fine', 'выговор': 'warn', 'нормально': 'ok', 'премия': 'bonus' }[v];
      let speech = D.DEMO.verdict[key];
      const n = ctx.beerDrunk, words = ['', 'бутылка', 'две бутылки', 'три бутылки', 'четыре бутылки'];
      if (n) speech += ` И где ${n < 5 ? words[n] : n + ' бутылок'} из ящика Серёжи?!`;
      return { verdict: v, fine: v === 'уволен' ? 1500 : v === 'штраф' ? 800 : v === 'выговор' ? 300 : 0, bonus: v === 'премия' ? 1000 : 0, speech, title: v === 'премия' ? 'Надежда франшизы' : v === 'уволен' ? 'Позор улицы Строителей' : 'Бариста районного масштаба' };
    };
    if (!live()) return local();
    const rv = ctx.reviews.map((r) => `${r.stars}★ ${r.who}: «${r.text.slice(0, 140)}»`).join('\n') || 'нет';
    const u = `Смена окончена${ctx.asleep ? ' — ты приехал и застал бариста спящим за прилавком' : ctx.early ? ' досрочно — ты сорвался и приехал разбираться' : ''}. Ты стоишь у окошка киоска и выносишь вердикт.\nФакты:\n— выручка ${ctx.cash} ₽ при плане 3500 ₽; обслужено ${ctx.served}, ушли без кофе ${ctx.lost};\n— рейтинг на картах ${ctx.rating} (утром 4,1);\n— отзывы за смену:\n${rv}\n— жалобы тебе: ${ctx.complaints.join('; ') || 'нет'};\n— пропущено твоих звонков: ${ctx.missedTotal}; бариста курил в сумме ${ctx.smokeMin} мин;\n— из твоего ящика пива «Серёже на юбилей» не хватает бутылок: ${ctx.beerDrunk}; сейчас у бариста ${ctx.promille} промилле;\n— отчёт тайного покупателя: ${ctx.shopperReport || 'тайный покупатель до окошка так и не дошёл'};\n— бариста ${ctx.guessedRight ? 'правильно вычислил тайного покупателя' : 'не угадал тайного покупателя'}.\nРеши судьбу бариста. Будь смешным, конкретным (упоминай реальные косяки и отзывы), но справедливым: хорошая работа заслуживает премии, провал — увольнения.`;
    try {
      const o = await AI.json([{ role: 'system', content: BOSS.replace('Ты звонишь бариста по телефону. Говори 1–3 предложения, до 260 знаков.', '') }, { role: 'user', content: u }],
        { think: true, maxTokens: 700, temperature: .9, timeout: 60000, schemaHint: '{"verdict":"уволен"|"штраф"|"выговор"|"нормально"|"премия","fine":0-5000,"bonus":0-3000,"speech":"твоя речь бариста у окошка: 3–4 коротких предложения, до 450 знаков","title":"прозвище бариста по итогам смены, 2–4 слова"}', fallback: null });
      if (!o) return local();
      const L = local();
      return {
        verdict: VERDICTS.includes(o.verdict) ? o.verdict : L.verdict,
        fine: clampN(o.fine, 0, 5000, L.fine), bonus: clampN(o.bonus, 0, 3000, L.bonus),
        speech: typeof o.speech === 'string' && o.speech.trim() ? o.speech.trim().slice(0, 700) : L.speech,
        title: typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 60) : L.title,
      };
    } catch (e) { fail(e); return local(); }
  };
})();
