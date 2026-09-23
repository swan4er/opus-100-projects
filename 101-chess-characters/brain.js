/* ================================================================
   brain.js — всё, что решает и говорит нейросеть.
   Правила шахмат держит код; нейросеть решает только «пойду или нет»
   (через AI.json со строгой схемой и проверкой) и что сказать.
   В демо-режиме — заготовки и простое распознавание уговоров.
   ================================================================ */
window.Brain = (function () {
  'use strict';
  const CAST = window.CAST;
  const KIND_RU = CAST.KIND_RU;
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const MOOD = { 'страх': 'fear', 'гнев': 'anger', 'злость': 'anger', 'гордость': 'smug', 'радость': 'joy', 'сомнение': 'think', 'обида': 'sad', 'грусть': 'sad',
    'восторг': 'joy', 'скука': 'bored', 'паника': 'shock', 'презрение': 'smug', 'решимость': 'anger', 'смирение': 'sad', 'кураж': 'goofy' };
  const TACTIC = { 'обещание': 'promise', 'лесть': 'flatter', 'угроза': 'threat', 'логика': 'logic', 'хамство': 'rude', 'нет': 'none', 'приказ': 'threat' };

  function trustWord(t) {
    return t >= 80 ? 'предан командиру' : t >= 60 ? 'в целом доверяет' : t >= 40 ? 'сомневается в командире' : t >= 20 ? 'не доверяет командиру' : 'презирает командира';
  }

  const WORLD = 'Это комедийные шахматы: фигуры — живые персонажи с характерами. Белые — армия игрока, игрок для них «командир». Чёрные — враги. Все говорят по-русски, живо, коротко и смешно, без мата, без реальных людей и брендов.';

  // ---------- факты о ходе → текст для нейросети ----------
  function factsText(f) {
    const L = [];
    L.push(`Приказ: ${f.who} идёт с ${f.from} на ${f.to}${f.capture ? `, взяв ${f.capture}` : ''}.`);
    if (f.danger === 'none') L.push('Там тебя никто не бьёт — прямой опасности нет.');
    else if (f.danger === 'trade') L.push(`Там тебя могут съесть (${f.attackers.join(', ')}), но за тебя отомстят (${f.defenders.join(', ') || 'свои'}) — это размен, ты скорее всего погибнешь.`);
    else L.push(`Там тебя почти наверняка съедят (${f.attackers.join(', ')})${f.defenders.length ? ', защита слабая' : ', и никто не защищает'}.`);
    if (f.mate) L.push('Этот ход ставит МАТ — это победа всей армии!');
    else if (f.check) L.push('Этот ход объявляет шах вражескому королю.');
    if (f.saves.length) L.push(`Этот ход спасает от гибели: ${f.saves.join(', ')}.`);
    if (f.threatens.length) L.push(`После хода ты угрожаешь: ${f.threatens.join(', ')}.`);
    const V = {
      'sac-good': 'Штаб (шахматный движок) считает: это жертва с расчётом, армии она выгодна.',
      good: 'Штаб считает ход хорошим для армии.',
      ok: 'Штаб считает ход терпимым.',
      bad: `Штаб считает ход сомнительным: армия теряет примерно ${f.lossWord}.`,
      blunder: `Штаб считает ход зевком: армия просто теряет ${f.lossWord}.`,
      mate: 'Штаб в восторге.',
    };
    L.push(V[f.verdict] || '');
    const T = {
      rim: 'Ход на край доски — коням там неуютно.',
      retreat: 'Это отступление назад.',
      opening: 'Ещё дебют, а ладье уже велят ходить.',
      forward: 'Королю велят выйти вперёд, из укрытия.',
      lazy: 'Тебе вообще лень куда-то идти.',
      cramped: 'Там тесно, диагонали закрыты своими же.',
      sulk: 'Ты обижен на командира и не хочешь ничего делать.',
    };
    if (f.trait && T[f.trait]) L.push(T[f.trait]);
    if (f.promises && f.promises.length) L.push(`Командир уже обещал раньше: ${f.promises.join('; ')}.`);
    if (f.broken && f.broken.length) L.push(`Ты знаешь, что командир не сдержал обещаний: ${f.broken.join('; ')}.`);
    return L.filter(Boolean).join('\n');
  }

  function decideSystem(p) {
    return `${WORLD}
Ты — ${p.name} (${KIND_RU[p.kind]}, белые). Характер: ${p.trait}.
Твоё доверие к командиру: ${Math.round(p.trust)}/100 — ${trustWord(p.trust)}.
Командир приказал тебе сходить. Ты решаешь сам: пойдёшь (go=true) или откажешься (go=false).
Как решать:
— умирать ты не хочешь, а зря — тем более; но если ход реально нужен армии (спасает ферзя или короля, ведёт к мату, выигрывает материал), это веский довод;
— высокое доверие — соглашаешься легче, низкое — упираешься;
— на уговоры реагируй по своему характеру: кого-то берёт лесть, кого-то обещания, трусов — угрозы (но от угроз доверие падает); пустые слова и хамство не прощай;
— если тебе грозит смерть, то на ПЕРВЫЙ приказ (когда командир ещё ничего не сказал) ты почти всегда отказываешься или торгуешься: ставь условие, выпрашивай гарантию, жалуйся; сразу соглашайся, только если доверие выше 80;
— не сдавайся с первого слабого довода, но и не упирайся вечно: хороший, смешной или попавший в твой характер довод — повод согласиться;
— если опасности нет, обычно соглашайся, разве что ход против твоего характера.
Реплика — 1–2 коротких предложения, до 22 слов, в своей манере, обращайся к командиру. Без кавычек, без ремарок в скобках, не повторяй свои прошлые фразы.`;
  }

  const SCHEMA = 'go: true или false (если тебе грозит смерть и командир ещё ничего не сказал — false, кроме случаев, когда доверие 80+ или ход ставит мат); say: твоя реплика; why: сухая причина решения для командира, до 8 слов, без шуток и без характера (например «на f7 меня съест король» или «обещание медали убедило»); mood: одно слово из [страх, гнев, гордость, радость, сомнение, обида, восторг, скука, паника]; trust: целое от -15 до 10 — как изменилось твоё доверие к командиру от этого разговора; tactic: как уговаривал командир — одно из [обещание, лесть, угроза, логика, хамство, нет]; promise: что конкретно пообещал командир (до 8 слов) или пустая строка';

  function historyText(h) {
    if (!h.length) return '';
    return 'Разговор до этого:\n' + h.map((x) => (x.who === 'cmd' ? 'Командир: «' : 'Ты: «') + x.text + '»').join('\n');
  }

  function normalize(r, fallback, f) {
    const out = Object.assign({}, fallback);
    if (r && typeof r === 'object') {
      out.why = '';
      if (typeof r.go === 'boolean') out.go = r.go;
      else if (typeof r.go === 'string') out.go = /^(true|да|yes|иду)/i.test(r.go.trim());
      if (typeof r.say === 'string' && r.say.trim().length > 1) out.say = r.say.trim().replace(/^["«„]+|["»“]+$/g, '').slice(0, 240);
      else if (out.go !== fallback.go) out.say = out.go ? 'Ладно, иду. Но это под вашу ответственность.' : 'Нет. Не пойду, и точка.';
      const mood = String(r.mood || '').toLowerCase().trim();
      out.expr = MOOD[mood] || (out.go ? 'happy' : 'fear');
      const t = Number(r.trust);
      out.trust = Number.isFinite(t) ? clamp(Math.round(t), -15, 10) : out.trust;
      out.tactic = TACTIC[String(r.tactic || '').toLowerCase().trim()] || out.tactic || 'none';
      if (typeof r.why === 'string' && r.why.trim().length > 2) out.why = r.why.trim().replace(/^["«„]+|["»“]+$/g, '').replace(/[.!]+$/, '').slice(0, 90);
      out.promise = typeof r.promise === 'string' ? r.promise.trim().replace(/^["«]+|["»]+$/g, '').slice(0, 80) : '';
      if (/^(нет|пусто|-|—|none)$/i.test(out.promise)) out.promise = '';
      if (!out.why) out.why = demoWhy(f, out.go, out.tactic);
      delete out.demo;
    }
    return out;
  }

  // ---------- демо: распознать тактику уговоров ----------
  function detectTactic(text) {
    const t = (text || '').toLowerCase();
    if (/(дурак|идиот|туп(ой|ая)|заткнись|болван)/.test(t)) return 'rude';
    if (/(убью|сотру|уволю|расстрел|трибунал|сожгу|накажу|пожалеешь|разжалую|в порошок|на дрова|выгоню|урою|под суд|в угол|чистить)/.test(t)) return 'threat';
    if (/(обеща|медал|повыш|ферз[её]м|отпуск|памятник|орден|награ|клянусь|слово даю|станешь|получишь|озолоч)/.test(t)) return 'promise';
    if (/(лучш|герой|умн|красив|смел|храбр|великолеп|незаменим|гени|звезд|легенд|восхищ|самый)/.test(t)) return 'flatter';
    if (/(спас|иначе|потому что|план|мат|выгод|размен|жертв|ради|защит|отомст|прикро)/.test(t)) return 'logic';
    return 'other';
  }

  function demoDecision(p, f, history, text) {
    const D = CAST.DEMO;
    const rounds = history.filter((h) => h.who === 'cmd').length + (text ? 1 : 0);
    const tactic = text ? detectTactic(text) : 'none';
    let chance = f.danger === 'hang' ? 0.08 : f.danger === 'trade' ? 0.3 : 0.55;
    chance += (p.trust - 50) / 200 + rounds * 0.2;
    if (f.saves.length || f.verdict === 'sac-good' || f.mate) chance += 0.15;
    const bonus = { promise: 0.2, flatter: p.kind === 'Q' || p.id === 'wPc' ? 0.35 : 0.12, threat: p.kind === 'P' ? 0.3 : 0.05, logic: 0.15, rude: -0.3, other: 0, none: 0 };
    chance += bonus[tactic] || 0;
    const go = Math.random() < clamp(chance, 0.03, 0.95);
    const dt = { promise: 4, flatter: 3, threat: -9, logic: 2, rude: -12, other: 0, none: 0 }[tactic] + (go ? 0 : -1);
    let say;
    if (!text) say = rnd((go ? D.agree : D.refuse)[p.kind]);
    else say = rnd(D.persuade[tactic === 'rude' || tactic === 'none' ? 'other' : tactic][go ? 'go' : 'no']);
    const promise = tactic === 'promise' ? (text.match(/(медал\S*|отпуск\S*|ферз\S*|памятник\S*|орден\S*)/i) || ['награду'])[0] : '';
    return { go, say, why: demoWhy(f, go, tactic), expr: go ? (tactic === 'threat' ? 'fear' : 'happy') : (f.danger === 'none' ? 'bored' : 'fear'), trust: dt, tactic: { rude: 'rude', other: 'none' }[tactic] || tactic, promise, demo: true };
  }

  // причина решения без нейросети — из тех же фактов о ходе
  const TRAIT_WHY = { rim: 'конь на краю — к беде', retreat: 'ферзи не отступают', opening: 'ладьи в дебюте не ходят', forward: 'королю опасно выходить вперёд', lazy: 'просто лень', sulk: 'обида на командира' };
  function demoWhy(f, go, tactic) {
    if (go) {
      const T = { promise: 'поверил обещанию', flatter: 'лесть сработала', threat: 'испугался угрозы', logic: 'убедил довод', other: 'уговорили' };
      if (T[tactic]) return T[tactic];
      return f.danger === 'none' ? 'опасности нет' : f.mate ? 'ход ставит мат' : f.saves.length ? 'ход спасает своих' : 'доверяет командиру';
    }
    if (tactic === 'rude') return 'на хамство не ведётся';
    if (f.danger === 'hang') return `на ${f.to} ${f.attackers.length ? 'бьёт ' + f.attackers[0] : 'съедят'}${f.defenders.length ? '' : ', никто не защитит'}`;
    if (f.danger === 'trade') return `на ${f.to} размен: бьёт ${f.attackers[0] || 'враг'}`;
    return TRAIT_WHY[f.trait] || 'не хочет, и всё';
  }

  // ---------- решение: пойду или нет ----------
  async function decide(p, f, history, text) {
    const fallback = demoDecision(p, f, history, text);
    if (AI.demo) { await sleep(700 + Math.random() * 700); return fallback; }
    const user = [factsText(f), historyText(history), text ? `Командир говорит тебе: «${text}»\nРеши заново: пойдёшь или нет?` : 'Командир ждёт ответа. Пойдёшь?'].filter(Boolean).join('\n\n');
    try {
      const r = await AI.json([{ role: 'user', content: user }], { system: decideSystem(p), schemaHint: SCHEMA, maxTokens: 180, temperature: 0.9, fallback: null });
      if (!r) return Object.assign(fallback, { failed: true });
      return normalize(r, fallback, f);
    } catch (e) {
      return Object.assign(fallback, { failed: true, error: e && e.ru });
    }
  }

  // ---------- одна реплика персонажа потоком (например, «есть, командир…» после приказа) ----------
  async function line(p, situation, onToken, demoLines) {
    if (AI.demo) { await sleep(400); const s = rnd(demoLines); onToken && onToken(s, s); return s; }
    const sys = `${WORLD}\nТы — ${p.name} (${KIND_RU[p.kind]}, ${p.team === 'w' ? 'белые' : 'чёрные'}). Характер: ${p.trait}.\nОтветь одной репликой до 16 слов, в своей манере, без кавычек и ремарок.`;
    try {
      const s = await AI.chat([{ role: 'user', content: situation }], { system: sys, maxTokens: 70, temperature: 0.95, onToken });
      return (s || '').trim().replace(/^["«]+|["»]+$/g, '') || rnd(demoLines);
    } catch (e) {
      const s = rnd(demoLines); onToken && onToken(s, s); return s;
    }
  }

  // ---------- реплики после хода: поток строк «Имя: текст» ----------
  const COMMENT_SYS = `${WORLD}
Ты — сценарист ситкома про эту партию. После хода пиши реплики фигур: они реагируют на то, что реально произошло, спорят и подкалывают друг друга. Белые ворчат на командира или хвалят его и огрызаются на чёрных; чёрные троллят белых и их командира. Шутки короткие и смешные, без повторов. Павшие фигуры могут ворчать «с того света». Супруги-ладьи Степаныч и Петровна вечно препираются, слоны Аркадий и Эдуард спорят о тьме и свете, Изольда и Клякса — соперницы.
Формат строго: каждая реплика с новой строки: Имя: текст. Имя — только из списка. Ровно столько реплик, сколько просят, до 16 слов в каждой. Никаких пояснений, заголовков, нумерации и ремарок в скобках.`;

  function matchName(raw, names) {
    const n = raw.toLowerCase().replace(/[*_«»"]/g, '').replace(/^(белая|белый|чёрная|черная|чёрный|черный)\s+/, '').trim();
    let hit = names.find((x) => x.key === n);
    if (hit) return hit.id;
    hit = names.find((x) => n.endsWith(x.key) || x.full === n);
    return hit ? hit.id : null;
  }

  async function comment(ctx, onLine) {
    const names = Object.keys(CAST.ALL).map((id) => ({ id, key: CAST.ALL[id].short.toLowerCase(), full: CAST.ALL[id].name.toLowerCase() }));
    const lines = [];
    const parse = (full, final) => {
      const rows = full.split('\n');
      rows.forEach((row, i) => {
        const done = final || i < rows.length - 1;
        const m = row.match(/^\s*[-–—•*]*\s*([А-ЯЁA-Zа-яё][А-ЯЁа-яёA-Za-z .]{1,30}?)\s*[:：]\s*(.*)$/);
        if (!m) return;
        const id = matchName(m[1], names);
        if (!id) return;
        const text = m[2].trim().replace(/^["«]+|["»]+$/g, '');
        if (!text) return;
        if (!lines[i]) lines[i] = { id, text: '', done: false };
        if (lines[i].done) return;
        lines[i].text = text; lines[i].done = done;
        onLine(i, id, text, done);
      });
    };
    if (AI.demo) {
      await sleep(300);
      const pool = ctx.demo || [];
      pool.forEach(([id, text], i) => onLine(i, id, text, true));
      return;
    }
    const user = `Фигуры на сцене:\n${ctx.cast}\n\nЧто произошло: ${ctx.events}\n\nНапиши ровно ${ctx.n || 3} реплики: ${ctx.focus}`;
    try {
      const full = await AI.chat([{ role: 'user', content: user }], { system: COMMENT_SYS, maxTokens: 220, temperature: 1.0, onToken: (d, f) => parse(f, false) });
      parse(full, true);
    } catch (e) {
      (ctx.demo || []).forEach(([id, text], i) => onLine(100 + i, id, text, true));
    }
  }

  return { decide, comment, line, detectTactic, factsText, why: demoWhy };
})();
