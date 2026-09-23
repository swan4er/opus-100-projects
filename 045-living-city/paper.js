/* ================================================================
   Тихоречинск — «Тихоречинский вестник».
   Газета о реальных событиях симуляции: опоздания, пробки, свидания,
   случайные встречи, рекорды пешеходов, самые людные места.
   Номер выходит каждое утро в 07:00; до первого утра — вечерний выпуск.
   Текст пишет DeepSeek через AI.json по списку фактов, без ключа —
   заготовки из data.js. Имена в номере кликабельны.
   ================================================================ */
(function (LC) {
  'use strict';
  const D = window.LC_DATA;
  const B = LC.brain;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => LC.esc(s);
  const nb = (s) => LC.nbsp(esc(s));
  const hasAI = () => window.AI && !AI.demo && !AI.shot;
  const g = (id, s) => LC.g(s, LC.pop.sex[id] === 1);

  // ================================================================
  // Газета
  // ================================================================
  const issues = new Map();
  function issueKey() {
    const c = LC.clock;
    const morning = c.min >= 7 * 60;
    // номер выходит в 07:00; до первого утра — вечерний выпуск
    const firstDay = LC.CFG.startDay;
    if (c.day === firstDay || (c.day === firstDay + 1 && !morning)) return { key: 'e' + firstDay, evening: true, day: firstDay };
    const d = morning ? c.day : c.day - 1; // номер этого утра: события с 07:00 вчерашнего дня
    return { key: 'm' + d, evening: false, day: d };
  }
  B.issueKey = issueKey;
  // материалы номера — только реальные события симуляции
  // кем приходятся друг другу двое встретившихся
  const PAIR = ['супруги', 'родитель и ребёнок', 'родитель и ребёнок', 'родственники', 'старые друзья', 'коллеги', 'соседи', 'бывшие',
    'один из них тайно влюблён в другого', 'начальник и подчинённый', 'начальник и подчинённый', 'пара', 'одноклассники'];
  function gatherNews(fromT) {
    const L = LC.life, pop = LC.pop, city = LC.city;
    const log = L.log.filter((e) => e.t >= fromT);
    const items = [];
    const nameOf = (id) => LC.name(id);
    const jams = log.filter((e) => e.type === 'jam').sort((a, b) => b.cars - a.cars);
    if (jams[0]) items.push({ kind: 'jam', fact: 'Пробка: на перекрёстке «' + jams[0].street1 + '» и «' + jams[0].street2 + '» в ' + LC.fmt(jams[0].t) + ' стояло ' + jams[0].cars + ' машин', people: [], data: jams[0] });
    const late = log.filter((e) => e.type === 'late').sort((a, b) => b.min - a.min);
    if (late[0]) items.push({ kind: 'late', fact: nameOf(late[0].id) + ' (' + LC.profTitle(late[0].id) + ') ' + g(late[0].id, 'опоздал{|а}') + ' на работу на ' + late[0].min + ' мин, место: ' + LC.venueName(late[0].v), people: [late[0].id], data: late[0] });
    const dl = log.filter((e) => e.type === 'dateLate').sort((a, b) => b.min - a.min);
    if (dl[0]) items.push({ kind: 'date', fact: nameOf(dl[0].id) + ' ' + g(dl[0].id, 'опоздал{|а}') + ' на свидание на ' + dl[0].min + ' мин ' + LC.venueIn(dl[0].v) + (dl[0].with >= 0 ? '; ' + g(dl[0].with, 'ждал{|а}') + ' ' + nameOf(dl[0].with) : ''), people: [dl[0].id].concat(dl[0].with >= 0 ? [dl[0].with] : []), data: dl[0] });
    const meets = log.filter((e) => e.type === 'meet');
    const pri = (e) => (e.rel === 7 ? 3 : e.rel === 8 ? 3 : e.rel === 9 || e.rel === 10 ? 2 : 1);
    meets.sort((a, b) => pri(b) - pri(a));
    const usedM = new Set();
    for (const m of meets) {
      if (usedM.size >= 2) break;
      const k = Math.min(m.a, m.b) + ':' + Math.max(m.a, m.b);
      if (usedM.has(k)) continue;
      usedM.add(k);
      items.push({ kind: 'meet', fact: 'Случайная встреча: ' + nameOf(m.a) + ' и ' + nameOf(m.b) + ' (' + PAIR[m.rel] + ') оказались ' + LC.venueIn(m.v).replace(/^— /, 'в заведении ') + ' в ' + LC.fmt(m.t), people: [m.a, m.b], data: m });
    }
    // рекорд пешехода
    let bw = -1, bk = 0;
    for (let id = 0; id < pop.n; id++) if (L.km[id] > bk && L.act[id] !== LC.A.STREET) { bk = L.km[id]; bw = id; }
    if (bw >= 0 && bk > 1500) items.push({ kind: 'walker', fact: nameOf(bw) + ' ' + g(bw, 'прош{ёл|ла}') + ' за день ' + (bk / 1000).toFixed(1).replace('.', ',') + ' км — больше всех в городе', people: [bw] });
    // самое людное заведение сейчас
    let bv = -1, bn = 0;
    for (let v = 0; v < city.venues.length; v++) { const t = city.venues[v].type; if ((t === 'bar' || t === 'cafe' || t === 'restaurant' || t === 'culture') && L.vIn[v].size > bn) { bn = L.vIn[v].size; bv = v; } }
    if (bv >= 0 && bn >= 4) items.push({ kind: 'crowd', fact: 'Самое людное место: ' + LC.venueName(bv) + ' — ' + bn + ' гостей в ' + LC.fmt(LC.clock.min), people: [] });
    // свидания сегодня и кто опаздывает прямо сейчас — живые данные модели
    const pairs = new Set();
    for (const [a, d] of L.dates) if (a < d.with) pairs.add(a);
    if (pairs.size) {
      let on = -1;
      for (const a of pairs) if (L.act[a] === LC.A.DATE && L.st[a] === 0 && L.act[L.dates.get(a).with] === LC.A.DATE && L.st[L.dates.get(a).with] === 0) { on = a; break; }
      items.push({ kind: 'dates', fact: 'Свиданий сегодня в городе: ' + pairs.size + (on >= 0 ? '; прямо сейчас вместе ' + nameOf(on) + ' и ' + nameOf(L.dates.get(on).with) + ' ' + LC.venueIn(L.dates.get(on).v) : ''), people: on >= 0 ? [on, L.dates.get(on).with] : [] });
    }
    let lateId = -1, lateMin = 0;
    for (let id = 0; id < pop.n; id++) {
      const st = L.st[id];
      if (st === 0 || st === 3 && false) continue;
      const ag = L.ag[id], it = ag && ag[L.agi[id]];
      if (!it || !it.fx || (it.a !== LC.A.WORK && it.a !== LC.A.DATE)) continue;
      const m = LC.clock.t - it.s;
      if (m > lateMin) { lateMin = m; lateId = id; }
    }
    if (lateId >= 0 && lateMin >= 5) items.push({ kind: 'lateNow', fact: 'Прямо сейчас сильнее всех опаздывает ' + nameOf(lateId) + ': ' + (L.act[lateId] === LC.A.DATE ? 'на свидание' : 'на работу') + ', уже ' + Math.round(lateMin) + ' мин', people: [lateId] });
    let inBars = 0;
    for (let v = 0; v < city.venues.length; v++) if (city.venues[v].type === 'bar') inBars += L.vIn[v].size;
    if (inBars > 20) items.push({ kind: 'bars', fact: 'В барах города сейчас ' + inBars + ' человек', people: [] });
    // дни рождения
    const doy = (LC.clock.day * 1 + 265) % 365;
    const bd = [];
    for (let id = 0; id < pop.n && bd.length < 3; id++) if (pop.birthday[id] === doy && pop.age[id] >= 18) bd.push(id);
    if (bd.length) items.push({ kind: 'bday', fact: 'Дни рождения сегодня: ' + bd.map((id) => nameOf(id) + ' (' + (pop.age[id] + 1) + ')').join(', '), people: bd });
    // счётчики дня
    const k = L.counts();
    items.push({ kind: 'city', fact: 'Сейчас на улицах ' + k.walk + ' человек, в метро ' + k.metro + ', дома ' + k.home + '; машин в движении: ' + LC.traffic.countMoving(), people: [] });
    return items;
  }
  B.gatherNews = gatherNews;

  // имена в тексте склоняются («ждал Аллу Леонову»), поэтому ищем по основам имени и фамилии
  function linkNames(text, people) {
    let html = nb(text);
    const stem = (w, min) => w.slice(0, Math.max(min, w.length - 2));
    const SP = '[\\s\\u00a0]+';
    for (const id of people) {
      const [first, sur] = LC.name(id).split(' ');
      const re = new RegExp(stem(first, 3) + '[а-яё]*' + SP + stem(sur, 4) + '[а-яё]*', 'g');
      html = html.replace(re, (m) => '<button type="button" class="pname" data-id="' + id + '">' + m + '</button>');
    }
    return html;
  }
  function renderPaper(iss, P) {
    const c = LC.clock;
    const dayName = LC.DAYS[(iss.day % 7 + 7) % 7];
    const people = new Set();
    for (const it of iss.items) for (const id of it.people) people.add(id);
    const ppl = [...people];
    let h = '<div class="mast"><div class="mt" id="paper-title">Тихоречинский вестник</div><div class="ms"><span>' + LC.cap(dayName) + ' · ' + (iss.evening ? 'вечерний выпуск' : 'утренний выпуск') + '</span><span>№ ' + (1 + iss.day - LC.CFG.startDay) + '</span><span>Цена свободная</span></div></div>';
    h += '<div class="lead"><h2>' + nb(P.headline) + '</h2><p>' + linkNames(P.lead, ppl) + '</p></div>';
    h += '<div class="cols">';
    for (const a of P.articles) h += '<div class="art"><h3>' + nb(a.title) + '</h3><p>' + linkNames(a.text, ppl) + '</p></div>';
    h += '</div>';
    if (P.briefs && P.briefs.length) h += '<div class="briefs"><b>Коротко</b><ul>' + P.briefs.map((b) => '<li>' + linkNames(b, ppl) + '</li>').join('') + '</ul></div>';
    h += '<div class="paper-foot">' + nb(P.ai ? 'Номер написала нейросеть DeepSeek по событиям, которые произошли в модели города. Имена кликабельны — камера полетит к человеку.' : 'Номер собран из заготовок по событиям модели города (демо-режим). Имена кликабельны — камера полетит к человеку.') + '</div>';
    $('paper-body').innerHTML = h;
    void c;
  }
  function demoPaper(items) {
    const P = { headline: '', lead: '', articles: [], briefs: [] };
    const T = D.paper;
    const pick = (arr, k) => arr[k % arr.length];
    const minW = (n) => n + ' ' + LC.plural(n, 'минуту', 'минуты', 'минут');
    const carW = (n) => n + ' ' + LC.plural(n, 'машина', 'машины', 'машин');
    const place = (v) => { const n = LC.venueName(v); return n[0].toLowerCase() + n.slice(1); };
    for (const it of items) {
      const d = it.data || {};
      let title = '', text = it.fact + '.';
      if (it.kind === 'jam' && T.jam) title = LC.fill(pick(T.jam, d.cars), { street1: d.street1, street2: d.street2, cars: carW(d.cars), time: LC.fmt(d.t) });
      else if (it.kind === 'late' && T.late_work) title = LC.fill(pick(T.late_work, d.min), { name: LC.name(d.id), min: minW(d.min), work: LC.venueName(d.v) }, LC.pop.sex[d.id] === 1);
      else if (it.kind === 'date' && T.date_late) title = LC.fill(pick(T.date_late, d.min), { name: LC.name(d.id), min: minW(d.min), place: place(d.v) }, LC.pop.sex[d.id] === 1);
      else if (it.kind === 'meet' && T.meet) title = LC.fill(pick(T.meet, d.a), { name1: LC.name(d.a), name2: LC.name(d.b), place: place(d.v) });
      else if (it.kind === 'walker' && T.walker) title = LC.fill(pick(T.walker, it.people[0]), { name: LC.name(it.people[0]), km: (LC.life.km[it.people[0]] / 1000).toFixed(1).replace('.', ',') }, LC.pop.sex[it.people[0]] === 1);
      if (title) P.articles.push({ title, text });
      else P.briefs.push(it.fact);
    }
    const first = P.articles[0];
    P.headline = first ? first.title : 'Тихий день в Тихоречинске';
    P.lead = first ? first.text + ' Остальное — в номере.' : 'Город жил своей жизнью: ' + (items.find((i) => i.kind === 'city') || { fact: '' }).fact + '.';
    if (first) P.articles.shift();
    if (!P.articles.length) P.articles.push({ title: 'Город в цифрах', text: (items.find((i) => i.kind === 'city') || { fact: 'Данные собираются' }).fact + '.' });
    return P;
  }
  B.openPaper = async function () {
    const box = $('paper');
    box.hidden = false;
    $('paper-btn').classList.remove('fresh');
    const iss = issueKey();
    let entry = issues.get(iss.key);
    if (entry && entry.P) { renderPaper(entry, entry.P); return; }
    if (!entry) {
      const fromT = iss.evening ? 0 : (iss.day - 1) * 1440 + 7 * 60;
      entry = { key: iss.key, day: iss.day, evening: iss.evening, items: gatherNews(fromT) };
      issues.set(iss.key, entry);
    }
    if (!hasAI()) { entry.P = demoPaper(entry.items); renderPaper(entry, entry.P); return; }
    $('paper-body').innerHTML = '<div class="mast"><div class="mt" id="paper-title">Тихоречинский вестник</div></div><div class="paper-wait">Редакция верстает номер по&nbsp;событиям города<span class="thinking"><i></i><i></i><i></i></span></div>';
    if (entry.pending) return;
    entry.pending = true;
    const allowed = new Set();
    for (const it of entry.items) for (const id of it.people) allowed.add(id);
    const facts = entry.items.map((it, i) => (i + 1) + '. ' + it.fact).join('\n');
    const r = await AI.json([{ role: 'user', content: 'События в городе Тихоречинске (' + (iss.evening ? 'вечерний выпуск, события за сегодня' : 'утренний выпуск, события за прошедшие сутки') + '):\n' + facts }], {
      system: 'Ты — редактор городской газеты «Тихоречинский вестник». Пиши живо, с добрым провинциальным юмором, по-русски, без канцелярита. ' +
        'Используй ТОЛЬКО события из списка, ничего не выдумывай. Людей называй по имени и фамилии, как в событиях, и склоняй их грамотно по-русски.',
      schemaHint: '{"headline": "шапка дня до 70 знаков", "lead": "2 предложения", "articles": [{"title": "до 60 знаков", "text": "2–3 предложения"}], "briefs": ["короткая строка"]} — 3–4 заметки, 2–3 строки в «Коротко»',
      maxTokens: 900, temperature: 0.8, fallback: null,
    });
    entry.pending = false;
    let P = null;
    if (r && typeof r.headline === 'string' && Array.isArray(r.articles) && r.articles.length) {
      P = {
        headline: r.headline.slice(0, 120), lead: String(r.lead || '').slice(0, 500), ai: true,
        articles: r.articles.filter((a) => a && typeof a.title === 'string' && typeof a.text === 'string').slice(0, 5).map((a) => ({ title: a.title.slice(0, 110), text: a.text.slice(0, 700) })),
        briefs: Array.isArray(r.briefs) ? r.briefs.filter((b) => typeof b === 'string').slice(0, 4).map((b) => b.slice(0, 200)) : [],
      };
    }
    if (!P) P = demoPaper(entry.items);
    entry.P = P;
    if (!box.hidden) renderPaper(entry, P);
  };
  // утренний номер выходит в 07:00
  let lastIssue = '';
  LC.on('tick', () => {
    const k = issueKey().key;
    if (k !== lastIssue) {
      if (lastIssue && k[0] === 'm') { $('paper-btn').classList.add('fresh'); LC.ui.toast('Вышел утренний номер «Тихоречинского вестника»'); }
      lastIssue = k;
    }
  });
})(window.LC);
