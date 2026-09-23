/* ================================================================
   Участковый · движок правил
   Всё, что меняет игру, проходит здесь: время, броски d20, улики,
   репутация, вещи, деньги, задания, обвинение и финал.
   Нейросеть только предлагает — код проверяет и применяет.
   ================================================================ */
window.U = window.U || {};

U.Engine = (function () {
  'use strict';
  const D = U.DATA;
  const SAVE_KEY = 'uchastkovy.save.v1';
  const LAST_KEY = 'uchastkovy.lastcase';
  const START = 8 * 60 + 40;               // понедельник, 08:40 — автобус привозит нового участкового
  const DEADLINE = 3 * 1440 + 9 * 60;      // четверг, 09:00 — Полкан ждёт виновного
  const WEEK = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const SOCIAL = ['обаяние', 'нажим'];
  const DRINKERS = ['leshy', 'gorynych', 'vodyanoy'];

  let S = null;                            // состояние партии
  const listeners = {};
  const on = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  const emit = (type, data) => { (listeners[type] || []).forEach((fn) => { try { fn(data); } catch (e) { setTimeout(() => { throw e; }); } }); };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : d));
  const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // ---------- русская типографика: неразрывные пробелы после коротких слов ----------
  function typo(s) {
    if (!s) return '';
    const re = /(^|[\s(«„"])(в|к|с|и|а|о|у|я|но|на|по|за|от|до|из|не|ни|об|во|со|ко|же|то|ли|бы|он|мы|вы|их|её|ей)\s+/gi;
    return String(s)
      .replace(re, '$1$2\u00A0').replace(re, '$1$2\u00A0')
      .replace(/(\d)\s+(₽|руб|лет|мин|ч|м|км|кг|%)/g, '$1\u00A0$2')
      .replace(/\s+—\s*/g, '\u00A0— ')
      .replace(/\.\.\./g, '…');
  }

  // ---------- время ----------
  function clock(t = S.time) {
    const day = Math.floor(t / 1440) + 1;
    const m = ((t % 1440) + 1440) % 1440;
    const hour = Math.floor(m / 60), min = m % 60;
    const phase = hour >= 5 && hour < 8 ? 'утро' : hour >= 8 && hour < 18 ? 'день' : hour >= 18 && hour < 21 ? 'вечер' : 'ночь';
    const hh = String(hour).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    return { day, hour, min, m, phase, hh, weekday: WEEK[(day - 1) % 7], wd: WD[(day - 1) % 7], night: phase === 'ночь', label: `${WEEK[(day - 1) % 7]}, ${hh}` };
  }
  const fmt = (t) => clock(t).hh;

  // ---------- где кто ----------
  function whereIs(id, t = S.time) {
    const c = D.CHARS[id];
    if (!c || c.phone) return null;
    const h = clock(t).hour;
    for (const [a, b, loc] of c.sched) if (h >= a && h < b) return loc;
    return c.sched.length ? c.sched[0][2] : null;
  }
  function present(loc, t = S.time) {
    return Object.keys(D.CHARS).filter((id) => whereIs(id, t) === loc);
  }
  function asleep(id, t = S.time) {
    const h = clock(t).hour;
    const sc = caseData();
    const busy = sc.culprit === id && inNight(sc.nightAct, h);
    if (busy) return false;
    if (id === 'yaga') return h >= 0 && h < 7;
    if (id === 'emelya') return h >= 23 || h < 8;
    if (id === 'kikimora') return h >= 3 && h < 7;
    return false;
  }
  const inNight = (na, h) => (na ? (na.from < na.to ? h >= na.from && h < na.to : h >= na.from || h < na.to) : false);

  // ---------- дело ----------
  const caseData = () => D.CASES[S.caseId];
  function allClues() {
    const sc = caseData();
    const list = sc.clues.concat(D.HERRINGS.filter((h) => h.about !== sc.culprit));
    const eggWho = sc.eggAt === '@emelya' ? 'emelya' : '@' + sc.eggAt;
    list.push({ id: 'egg', who: eggWho, need: 'roll', sk: sc.searchSkill, dc: 13, points: sc.culprit, search: true, topic: 'обыск тайника', text: 'Найдено яйцо Кощея — ' + sc.eggHide + '.' });
    list.push({ id: 'witness', who: '@' + sc.nightAct.loc, need: 'roll', sk: 'сыск', dc: 12, points: sc.culprit, night: sc.nightAct, topic: 'наблюдение ночью', text: 'Ночью вы своими глазами видели: ' + sc.nightAct.text + '.' });
    return list;
  }
  const clueById = (id) => allClues().find((c) => c.id === id);
  const found = (id) => !!(S.clues[id]);

  // Какие улики можно раскрыть прямо сейчас (для промпта мастера и для проверки)
  function cluesHere(ctx) {
    const h = clock().hour;
    return allClues().filter((c) => {
      if (found(c.id)) return false;
      if (c.from && S.time < c.from) return false;
      if (c.requires && !found(c.requires)) return false;
      if (c.night && !inNight(c.night, h)) return false;
      if (c.who[0] === '@') return c.who === '@' + ctx.loc;
      if (c.id === 'egg') return (ctx.present || []).includes(c.who);
      return (ctx.present || []).includes(c.who) || ctx.to === c.who;
    });
  }
  function revealOK(c, rolled, ok, ctx) {
    if (!c) return false;
    if (rolled && !ok) return false;
    if (c.need === 'free') return true;
    if (c.need === 'trust') return (S.att[c.who] || 0) >= (c.att || 0) || (rolled && ok);
    return rolled && ok;
  }

  // ---------- броски ----------
  function mods(sk, to) {
    const base = (D.SKILLS[sk] || D.SKILLS['сыск']).base;
    const m = [{ label: sk, v: base }];
    const c = clock();
    if (to && SOCIAL.includes(sk) && D.CHARS[to] && !D.CHARS[to].phone) {
      const a = S.att[to] || 0;
      if (a >= 3) m.push({ label: 'дружба', v: 2 });
      else if (a >= 1) m.push({ label: 'симпатия', v: 1 });
      else if (a <= -3) m.push({ label: 'вражда', v: -2 });
      else if (a <= -1) m.push({ label: 'неприязнь', v: -1 });
    }
    if (drunk()) {
      if (sk === 'сыск' || sk === 'сноровка') m.push({ label: 'пиво', v: -2 });
      if (sk === 'обаяние' && DRINKERS.includes(to)) m.push({ label: 'пиво', v: 1 });
    }
    if (sk === 'сыск' && c.night && !S.inv.includes('flashlight')) m.push({ label: 'темно', v: -2 });
    if ((sk === 'нажим' || sk === 'бюрократия') && S.auth >= 70) m.push({ label: 'авторитет', v: 1 });
    if (sk === 'нажим' && S.auth <= 20) m.push({ label: 'авторитет', v: -1 });
    if (sk === 'нажим' && S.flags.badgeShown === to) m.push({ label: 'удостоверение', v: 1 });
    return m;
  }
  function roll(sk, dc, to) {
    if (!D.SKILLS[sk]) sk = 'сыск';
    dc = clamp(Math.round(num(dc, 12)), 5, 20);
    const d = 1 + Math.floor(Math.random() * 20);
    const m = mods(sk, to);
    const total = d + m.reduce((s, x) => s + x.v, 0);
    const ok = d === 20 ? true : d === 1 ? false : total >= dc;
    const r = { sk, dc, d, mods: m, total, ok, crit: d === 20 ? 'крит' : d === 1 ? 'провал' : '' };
    S.rolls = (S.rolls || 0) + 1;
    return r;
  }

  const drunk = () => S.drunkUntil > S.time;

  // ---------- состояние ----------
  function fresh(caseId) {
    const ids = Object.keys(D.CASES);
    let last = null; try { last = localStorage.getItem(LAST_KEY); } catch {}
    if (!caseId) {
      const pool = ids.filter((x) => x !== last);
      caseId = pool[Math.floor(Math.random() * pool.length)];
    }
    try { localStorage.setItem(LAST_KEY, caseId); } catch {}
    const att = {};
    Object.keys(D.CHARS).forEach((id) => { att[id] = 0; });
    att.koschei = 1;
    const mem = {}, hist = {};
    Object.keys(D.CHARS).forEach((id) => { mem[id] = []; hist[id] = []; });
    return {
      v: 1, caseId, time: START, loc: 'square', to: null,
      money: 500, auth: 40, att, mem, hist,
      inv: ['badge', 'flashlight'], clues: {}, rumors: [], quests: [], log: [], leads: ['Осмотреть кабинет Кощея в автосалоне.', 'Опросить охрану — Змея Горыныча.', 'На празднике были все. У кого был мотив?'],
      drunkUntil: 0, accusations: 0, calls: {}, events: {}, flags: {}, over: null, egg: false, rolls: 0, turns: 0, qn: 0, recent: [], seen: {},
    };
  }

  function newGame(caseId) {
    S = fresh(caseId);
    log('Прибыл в ПГТ Тридевятое для прохождения службы. Принял дело о пропаже яйца гр. Кощея.');
    save();
    emit('state', S);
    return S;
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.v !== 1 || !D.CASES[s.caseId]) return null;
      S = Object.assign(fresh(s.caseId), s);
      return S;
    } catch { return null; }
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch {} }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
  function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch {} }

  function log(text) {
    S.log.push({ t: S.time, text: str(text, 240) });
    if (S.log.length > 80) S.log.splice(1, S.log.length - 80);
  }
  function rumor(text) {
    text = str(text, 160);
    if (!text) return;
    S.rumors.push({ t: S.time, text });
    if (S.rumors.length > 12) S.rumors.shift();
    emit('rumor', text);
  }
  function memo(id, text) {
    text = str(text, 160);
    if (!id || !text || !S.mem[id]) return;
    S.mem[id].push(clock().wd + ' ' + fmt(S.time) + ': ' + text);
    if (S.mem[id].length > 8) S.mem[id].splice(0, S.mem[id].length - 8);
  }
  function note(line) {
    S.recent.push(str(line, 300));
    if (S.recent.length > 10) S.recent.splice(0, S.recent.length - 10);
  }
  function pushHist(id, role, content) {
    if (!S.hist[id]) S.hist[id] = [];
    S.hist[id].push({ role, content: str(content, 600) });
    if (S.hist[id].length > 10) S.hist[id].splice(0, S.hist[id].length - 10);
  }

  // ---------- время идёт: события мира ----------
  function advance(min) {
    min = clamp(Math.round(num(min, 10)), 0, 24 * 60);
    const before = S.time;
    S.time += min;
    const out = [];
    // утренний звонок Полкана в 9:00 каждого дня
    for (let d = Math.floor(before / 1440); d <= Math.floor(S.time / 1440); d++) {
      const callAt = d * 1440 + 9 * 60;
      if (d > 0 && callAt > before && callAt <= S.time && !S.calls[d + 1]) out.push({ type: 'call', day: d + 1 });
    }
    const ev = caseData().event;
    if (ev && !S.events.main) {
      const at = (ev.day - 1) * 1440 + ev.hour * 60;
      if (S.time >= at) {
        S.events.main = true;
        memo(ev.who, ev.text);
        rumor(ev.text);
        log(ev.text);
        out.push({ type: 'event', text: ev.text });
      }
    }
    if (drunk() === false && S.flags.wasDrunk) { S.flags.wasDrunk = false; out.push({ type: 'sober' }); }
    if (S.time >= DEADLINE && !S.over) out.push({ type: 'deadline' });
    emit('time', { from: before, to: S.time, events: out });
    return out;
  }

  // ---------- применить решение мастера (с проверкой) ----------
  // dec — ответ мастера, br — выбранная ветка (ok/no), r — бросок или null, ctx — {loc, present, to, phone}
  function apply(dec, br, r, ctx) {
    const res = { clues: [], items: [], lost: [], att: 0, auth: 0, money: 0, quest: null, fx: null, move: null, rumor: null, minutes: 10, notes: [] };
    br = br || {};
    const to = ctx.to && D.CHARS[ctx.to] ? ctx.to : null;
    const rolled = !!r, ok = r ? r.ok : true;

    // улика: только из списка доступных здесь и только по правилам доступа
    const want = [].concat(br.clue || []).filter((x) => typeof x === 'string').slice(0, 2);
    const here = cluesHere(ctx);
    for (const id of want) {
      const c = here.find((x) => x.id === id);
      if (!c) continue;
      if (c.id === 'egg' && dec.type !== 'search' && !(r && r.search)) continue;
      if (!revealOK(c, rolled, ok, ctx)) continue;
      S.clues[c.id] = { t: S.time, via: c.who };
      res.clues.push(c);
      log('Установлено. ' + c.text);
      if (c.lead && !S.leads.includes(c.lead)) S.leads.push(c.lead);
      if (c.id === 'egg') { S.egg = true; if (!S.inv.includes('egg')) S.inv.push('egg'); res.items.push('egg'); rumor('Участковый нашёл Кощеево яйцо!'); }
    }

    // отношение собеседника: не больше ±2 за ход, плюс бонус кода за любимый подарок
    let att = clamp(Math.round(num(br.att)), -2, 2);
    const take = str(br.take, 20);
    if (take && S.inv.includes(take) && !D.ITEMS[take]?.fixed) {
      S.inv.splice(S.inv.indexOf(take), 1);
      res.lost.push(take);
      if (to && D.CHARS[to].likes === take) { att += 1; res.notes.push('Любимое угощение'); }
      log('Передано' + (to ? ' (гр. ' + D.CHARS[to].name + ')' : '') + ': ' + D.ITEMS[take].name + '.');
    }
    if (to && !D.CHARS[to].phone && att) {
      S.att[to] = clamp((S.att[to] || 0) + clamp(att, -3, 3), -5, 5);
      res.att = att;
    }
    // авторитет, деньги
    const auth = clamp(Math.round(num(br.auth)), -3, 3);
    if (auth) { S.auth = clamp(S.auth + auth, 0, 100); res.auth = auth; }
    let money = clamp(Math.round(num(br.money)), -300, 300);
    if (money < 0) money = -Math.min(-money, S.money);
    if (money) { S.money += money; res.money = money; if (money > 0 && to) { S.flags.bribes = (S.flags.bribes || 0) + 1; log('Получено ' + money + ' ₽ (гр. ' + D.CHARS[to].name + ').'); } }
    // вещи: давать можно только обычные вещи, яйцо — только через обыск
    const give = str(br.give, 20);
    if (give && D.ITEMS[give] && !D.ITEMS[give].fixed && give !== 'egg' && S.inv.length < 12) {
      S.inv.push(give); res.items.push(give);
      log('Получил: ' + D.ITEMS[give].name + '.');
    }
    // задание
    const qid = str(br.quest, 12);
    const q = S.quests.find((x) => x.id === qid && x.status === 'active');
    if (q) {
      q.status = 'done'; q.doneAt = S.time; res.quest = q;
      S.auth = clamp(S.auth + 5, 0, 100);
      if (S.att[q.giver] != null) S.att[q.giver] = clamp(S.att[q.giver] + 2, -5, 5);
      S.money += 100;
      log('Закрыто заявление «' + q.title + '».');
      rumor('Участковый разобрался с делом «' + q.title + '».');
    }
    // эффект сцены
    const fx = str(br.fx, 16);
    if (fx && D.FX[fx]) res.fx = fx;
    // переход в другое место
    const mv = str(dec.move, 16);
    if (mv && D.LOCS[mv] && mv !== S.loc) res.move = mv;
    // слух и память
    if (br.rumor) { rumor(br.rumor); res.rumor = str(br.rumor, 160); }
    if (to && br.memo) memo(to, br.memo);
    if (br.log) log(br.log);
    // время
    const dflt = dec.type === 'search' ? 30 : dec.type === 'act' ? 20 : 10;
    res.minutes = clamp(Math.round(num(br.min, dflt)), 5, 180);
    S.turns++;
    emit('apply', res);
    return res;
  }

  // ---------- действия интерфейса ----------
  function moveTo(loc, minutes) {
    if (!D.LOCS[loc] || loc === S.loc) return null;
    const from = S.loc;
    S.loc = loc; S.to = null;
    const ev = advance(minutes || 15);
    save();
    emit('move', { from, to: loc });
    return ev;
  }
  function buy(id) {
    const it = D.ITEMS[id];
    if (!it || !it.price || S.money < it.price) return false;
    if (whereIs('kikimora') !== S.loc || asleep('kikimora')) return false;
    const h = clock().hour; if (h < 8 || h >= 21) return false;
    S.money -= it.price; S.inv.push(id);
    log('Купил: ' + it.name + ' за ' + it.price + ' ₽.');
    save(); emit('state', S);
    return true;
  }
  function drink() {
    const i = S.inv.indexOf('beer');
    if (i < 0) return false;
    S.inv.splice(i, 1);
    S.drunkUntil = Math.max(S.drunkUntil, S.time) + 120;
    S.flags.wasDrunk = true;
    S.flags.drinks = (S.flags.drinks || 0) + 1;
    log('Употребил пиво «Тридевятое» при исполнении.');
    rumor('Участковый пил пиво в месте «' + D.LOCS[S.loc].short + '».');
    advance(10); save(); emit('state', S);
    return true;
  }
  function feedCat() {
    const i = S.inv.indexOf('sourcream');
    if (i < 0 || S.loc !== 'square') return null;
    S.inv.splice(i, 1);
    const hint = D.CAT_HINT[S.caseId];
    log('Накормил кота на площади сметаной.');
    if (!S.leads.includes(hint)) S.leads.push(hint);
    advance(5); save(); emit('state', S);
    return hint;
  }
  function sleep() {
    const c = clock();
    const next = (c.hour < 7 ? c.day - 1 : c.day) * 1440 + 7 * 60;
    const ev = advance(Math.max(30, next - S.time));
    S.drunkUntil = 0;
    log('Отдыхал в опорном пункте до 7:00.');
    save();
    return ev;
  }
  function addQuest(q) {
    if (!q || !D.CHARS[q.giver] || D.CHARS[q.giver].phone) return null;
    if (!D.LOCS[q.where]) q.where = whereIs(q.giver) || 'square';
    const item = {
      id: 'q' + (++S.qn), title: str(q.title, 60) || 'Заявление', giver: q.giver, where: q.where,
      text: str(q.text, 240), goal: str(q.goal, 160), secret: str(q.secret, 240), status: 'active', t: S.time, done: q.done || null,
    };
    if (S.quests.filter((x) => x.status === 'active').length >= 3) return null;
    if (S.quests.some((x) => x.title === item.title)) return null;
    S.quests.push(item);
    log('Принято заявление (гр. ' + D.CHARS[q.giver].name + '): «' + item.title + '».');
    save(); emit('quest', item);
    return item;
  }

  // ---------- обвинение ----------
  function accuse(suspect, ids) {
    const sc = caseData();
    const sel = (ids || []).filter((id) => found(id)).slice(0, 3);
    const support = sel.filter((id) => clueById(id)?.points === suspect).length;
    let verdict;
    if (suspect === sc.culprit && support >= 2) verdict = 'win';
    else if (suspect === sc.culprit) verdict = 'weak';
    else verdict = 'wrong';
    if (verdict === 'weak') { S.auth = clamp(S.auth - 5, 0, 100); log('Обвинение без достаточных доказательств (гр. ' + D.CHARS[suspect].name + '). Полковник Полкан вернул материалы.'); advance(30); }
    if (verdict === 'wrong') {
      S.accusations++;
      S.auth = clamp(S.auth - 10, 0, 100);
      S.att[suspect] = clamp((S.att[suspect] || 0) - 3, -5, 5);
      log('Ошибочное обвинение в краже яйца: гр. ' + D.CHARS[suspect].name + '.');
      rumor('Участковый зря обвинил в краже: ' + D.CHARS[suspect].name + '!');
      advance(30);
    }
    if (verdict === 'win') {
      const f = !!D.CHARS[suspect].fem;
      log((f ? 'Изобличена виновная' : 'Изобличён виновный') + ': гр. ' + D.CHARS[suspect].name + '. ' + (S.egg ? 'Яйцо изъято участковым лично.' : 'Яйцо возвращено ' + (f ? 'виновной' : 'виновным') + ' добровольно.'));
      finish(S.egg ? 'best' : 'good', suspect);
    } else if (verdict === 'wrong' && S.accusations >= 2) {
      finish('fired', suspect);
    }
    save(); emit('state', S);
    return { verdict, support, suspect };
  }
  function finish(kind, suspect) {
    if (S.over) return;
    S.over = { kind, suspect: suspect || null, t: S.time };
    save(); emit('end', S.over);
  }

  // ---------- подписи ----------
  function attLabel(v) {
    return v >= 3 ? 'по-дружески' : v >= 1 ? 'благосклонно' : v === 0 ? 'настороженно' : v >= -2 ? 'холодно' : 'враждебно';
  }

  return {
    on, emit, typo, clock, fmt, whereIs, present, asleep, caseData, allClues, clueById, found, cluesHere, revealOK,
    mods, roll, drunk, newGame, load, save, hasSave, wipe, log, rumor, memo, note, pushHist, advance, apply,
    moveTo, buy, drink, feedCat, sleep, addQuest, accuse, finish, attLabel, clamp, str, num,
    get S() { return S; }, START, DEADLINE, DRINKERS, inNight,
  };
})();
