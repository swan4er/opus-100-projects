/* ================================================================
   Тихоречинск — распорядок дня и описание «что с человеком сейчас».
   Для каждого жителя на каждый день: подъём, дорога, работа или учёба,
   обед, магазин, свидание, бар, прогулка, гости, сон — с учётом
   профессии, смены, выходных, характера и времени в пути.
   ================================================================ */
(function (LC) {
  'use strict';
  const D = window.LC_DATA;
  const S = LC.life;
  const A = LC.A, ST = LC.ST;
  const ACT_WHERE = LC.ACT_WHERE, ACT_TO = LC.ACT_TO;
  const EVE_ACT = [A.HOME, A.BAR, A.GYM, A.PARK, A.PROM, A.CULTURE, A.VISIT, A.CAFE];
  // город и жители появляются позже загрузки файла
  let city = null, pop = null;
  const sync = () => { city = LC.city; pop = LC.pop; };
  const bld = (b) => city.buildings[b];
  const ven = (v) => city.venues[v];
  const estTrip = (id, a, b) => S.estTrip(id, a, b);

  // ================================================================
  // Распорядок дня
  // ================================================================
  const H = (id, day, salt) => LC.hash2(id * 131 + salt, day * 977 + 13);
  function nearestOfType(type, x, z, pick) {
    const list = city.venuesByType[type] || [];
    let best = -1, bd = 1e9;
    for (const v of list) {
      const d = Math.abs(ven(v).x - x) + Math.abs(ven(v).z - z) + (pick ? LC.hash2(v, pick) * 160 : 0);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  function randomHomeOfRel(id, types) {
    for (let k = 0; k < pop.relN[id]; k++) {
      const o = pop.rel[id * 3 + k], t = pop.relT[id * 3 + k];
      if (types.includes(t) && pop.home[o] !== pop.home[id]) return o;
    }
    return -1;
  }
  S.dateOf = (id) => S.dates.get(id) || null;

  // свидания на день: пары из pop.dating
  S.planDates = planDates;
  function planDates(day) {
    sync();
    S.dates.clear();
    const wd = ((day % 7) + 7) % 7;
    const p = wd === 4 ? 0.8 : wd === 5 ? 0.6 : wd === 6 ? 0.3 : 0.22;
    for (let k = 0; k < pop.dating.length; k++) {
      const [a, b] = pop.dating[k];
      if (LC.hash2(k * 7 + 3, day) > p) continue;
      const ha = bld(pop.home[a]), hb = bld(pop.home[b]);
      const mx = (ha.doorX + hb.doorX) / 2, mz = (ha.doorZ + hb.doorZ) / 2;
      const r = LC.hash2(k, day * 3 + 1);
      const v = nearestOfType(r < 0.5 ? 'bar' : r < 0.8 ? 'cafe' : 'restaurant', mx, mz, k * 31 + day);
      if (v < 0) continue;
      let t = day * 1440 + 18 * 60 + 30 + Math.floor(LC.hash2(k, day * 5 + 2) * 5) * 20; // 18:30–19:50
      // оба должны успеть после работы
      for (const who of [a, b]) {
        const wv = pop.work[who], P = D.professions[pop.prof[who]];
        if (wv < 0 || !LC.worksToday(who, day) || P.shift === 'night' || P.shift === 'evening') continue;
        const e = day * 1440 + pop.shiftE[who];
        if (e < day * 1440 + 22 * 60) t = Math.max(t, e + estTrip(who, ven(wv).b, ven(v).b) * 1.2 + 10);
      }
      t = Math.min(Math.round(t / 10) * 10, day * 1440 + 21 * 60 + 30);
      S.dates.set(a, { with: b, v, t, k });
      S.dates.set(b, { with: a, v, t, k });
    }
  }

  // пункт распорядка: a — занятие, b — здание, v — заведение, s — начало, e — время ухода, fx — к фикс. времени
  const item = (a, b, v, s, e, fx) => ({ a, b, v, s, e, fx: !!fx });

  function genAgenda(id, day, wakeT) {
    if (pop !== LC.pop) sync();
    const P = D.professions[pop.prof[id]];
    const home = pop.home[id];
    const hB = bld(home);
    const wd = ((day % 7) + 7) % 7, weekend = wd >= 5, friday = wd === 4;
    const age = pop.age[id];
    const ag = [];
    const base = day * 1440;
    let t = wakeT;
    const r = (salt) => H(id, day, salt);
    const works = LC.worksToday(id, day) && P.at !== 'none';
    const shift = P.shift;
    const sS = base + pop.shiftS[id];
    let sE = base + pop.shiftE[id]; if (sE <= sS) sE += 1440;
    const wv = pop.work[id];
    const workB = wv >= 0 ? ven(wv).b : -1;
    const date = S.dates.get(id);
    // запас на дорогу: пунктуальные выходят заранее, рассеянные — впритык
    const buffer = (pop.punct[id] - 0.45) * 22 + (r(1) - 0.5) * 12;
    const margin = 1.08 + 0.22 * pop.punct[id];
    const sleepAt = (x) => base + (pop.sleep[id] < 600 ? pop.sleep[id] + 1440 : pop.sleep[id]) + (x || 0);
    let sleepT = sleepAt(weekend || friday ? 60 : 0);

    const pushHomeUntil = (until) => { if (until > t + 1) { ag.push(item(A.HOME, home, -1, t, until)); t = until; } };
    // выйти из дома к фиксированному времени start в здание b
    const goFixed = (a, b, v, start, end) => {
      const tr = estTrip(id, ag.length ? ag[ag.length - 1].b : home, b);
      const leaveT = start - tr * margin - buffer;
      if (ag.length) ag[ag.length - 1].e = Math.max(ag[ag.length - 1].s + 3, leaveT);
      ag.push(item(a, b, v, start, end, true));
      t = end;
    };
    const goFlex = (a, b, v, dur) => {
      const s = t;
      ag.push(item(a, b, v, s, s + dur));
      t = s + dur + estTrip(id, b, home) * 0.2;
    };
    const eveOuting = (after) => {
      t = Math.max(t, after);
      if (date && date.t > t - 30) {
        const dur = 120 + r(9) * 90;
        if (ag.length && ag[ag.length - 1].a === A.HOME) ag[ag.length - 1].e = date.t - estTrip(id, home, ven(date.v).b) * margin - buffer * 0.6;
        ag.push(item(A.DATE, ven(date.v).b, date.v, date.t, date.t + dur, true));
        t = date.t + dur;
        return;
      }
      let e = pop.eve[id];
      const pOut = friday ? 0.86 : weekend ? 0.74 : 0.5;
      if (r(7) > pOut) return;
      if (e === 0) { // домоседы в хорошую погоду всё же выходят подышать
        if (r(8) > (friday || weekend ? 0.38 : 0.22)) return;
        e = r(8) < 0.5 ? 3 : 4;
      }
      const a = EVE_ACT[e];
      if (a === A.BAR || a === A.GYM || a === A.CULTURE || a === A.CAFE) {
        const v = pop.fav[id] >= 0 ? pop.fav[id] : nearestOfType(a === A.BAR ? 'bar' : a === A.GYM ? 'gym' : a === A.CULTURE ? 'culture' : 'cafe', hB.doorX, hB.doorZ, id);
        if (v < 0) return;
        const dur = a === A.BAR ? 110 + r(11) * (friday || weekend ? 200 : 110) : a === A.GYM ? 70 + r(11) * 40 : a === A.CULTURE ? 140 + r(11) * 30 : 50 + r(11) * 60;
        const start = Math.max(t + 20, base + (a === A.CULTURE ? 19 * 60 : 18 * 60 + r(12) * 150));
        pushHomeUntilIfHome(start);
        ag.push(item(a, ven(v).b, v, start, start + dur));
        t = start + dur;
      } else if (a === A.VISIT) {
        const o = randomHomeOfRel(id, [4, 3, 2, 1, 12]);
        if (o < 0) return;
        const start = Math.max(t + 20, base + 18 * 60 + r(12) * 90);
        pushHomeUntilIfHome(start);
        ag.push(item(A.VISIT, pop.home[o], -1, start, start + 100 + r(13) * 80));
        ag[ag.length - 1].who = o;
        t = ag[ag.length - 1].e;
      } else if (a === A.PARK || a === A.PROM) {
        const start = Math.max(t + 10, base + 18 * 60 + r(12) * 120);
        pushHomeUntilIfHome(start);
        ag.push(item(a, -1, -1, start, start + 50 + r(13) * 70));
        t = ag[ag.length - 1].e;
      }
    };
    function pushHomeUntilIfHome(until) {
      const last = ag[ag.length - 1];
      if (!last || last.b !== home || last.a === A.SLEEP) { if (!last || last.a !== A.HOME) { pushHomeUntil(until); return; } }
      if (last.a === A.HOME) { last.e = Math.max(last.s + 3, until - estTrip(id, home, home) - 1); t = until; }
    }

    // --- утро дома ---
    ag.push(item(A.HOME, home, -1, t, t + 30 + r(2) * 40));
    t = ag[0].e;

    if (works && (P.at === 'street')) {
      // уличная работа: курьеры, дворники, патруль, промоутеры, музыканты, водители
      const depotJob = P.street === 'bus' || P.street === 'van';
      const depotB = LC.traffic ? LC.traffic.depotB : home;
      goFixed(A.STREET, depotJob ? depotB : home, -1, sS, sE);
      ag[ag.length - 1].street = P.street;
      if (!depotJob) ag[ag.length - 1].b = -1;
      t = sE;
      ag.push(item(A.HOME, home, -1, t, t));
      eveOuting(t);
    } else if (works && P.at === 'home') {
      // работа из дома: с обедом в кафе
      ag[0].e = base + 12 * 60 + r(3) * 90;
      t = ag[0].e;
      if (r(4) < 0.5) goFlex(A.CAFE, ven(nearestOfType('cafe', hB.doorX, hB.doorZ, id) || 0).b, nearestOfType('cafe', hB.doorX, hB.doorZ, id), 40 + r(5) * 40);
      if (r(6) < 0.35) goFlex(A.SHOP, ven(nearestOfType('shop', hB.doorX, hB.doorZ, id)).b, nearestOfType('shop', hB.doorX, hB.doorZ, id), 15 + r(8) * 15);
      eveOuting(t + 60);
    } else if (works && workB >= 0) {
      const isStudy = P.t === 'школьник' || P.t === 'студент';
      if (shift === 'night' || shift === 'evening') {
        // дневные дела до смены
        if (r(4) < 0.45) {
          const v = nearestOfType('shop', hB.doorX, hB.doorZ, id + day);
          ag[0].e = Math.min(sS - 240, t + 60 + r(5) * 120);
          t = ag[0].e;
          if (v >= 0 && t < sS - 200) goFlex(A.SHOP, ven(v).b, v, 20 + r(8) * 20);
        }
        goFixed(A.WORK, workB, wv, sS, sE);
      } else {
        goFixed(isStudy ? A.STUDY : A.WORK, workB, wv, sS, sE);
        // обед
        const lv = pop.lunch[id];
        if (lv >= 0 && sS < base + 12 * 60 && sE > base + 14 * 60 + 30) {
          const w = ag[ag.length - 1];
          const ls = base + 12 * 60 + 20 + Math.floor(r(10) * 5) * 15;
          const le = ls + 35 + r(14) * 20;
          w.e = ls - estTrip(id, workB, ven(lv).b);
          ag.push(item(A.LUNCH, ven(lv).b, lv, ls, le));
          ag.push(item(isStudy ? A.STUDY : A.WORK, workB, wv, le, sE));
        }
        t = sE;
        // после работы: магазин, дети — в парк
        if (P.t === 'школьник') {
          if (r(15) < 0.45) { ag.push(item(A.PARK, -1, -1, t, t + 50 + r(16) * 60)); t = ag[ag.length - 1].e; }
          else if (r(15) < 0.62) { const o = randomHomeOfRel(id, [4, 12]); if (o >= 0) { ag.push(item(A.VISIT, pop.home[o], -1, t, t + 80 + r(16) * 60)); ag[ag.length - 1].who = o; t = ag[ag.length - 1].e; } }
        } else if (r(15) < (friday ? 0.5 : 0.4)) {
          const v = nearestOfType('shop', hB.doorX, hB.doorZ, id + day * 7);
          if (v >= 0) { ag.push(item(A.SHOP, ven(v).b, v, t, t + 12 + r(16) * 14)); t = ag[ag.length - 1].e; }
        }
        if (P.t !== 'школьник' || age >= 14) eveOuting(t);
      }
    } else {
      // не работает сегодня: пенсионеры, декрет, безработные, выходной
      const pens = P.t === 'пенсионер';
      const mat = P.t === 'в декрете';
      ag[0].e = base + (pens ? 8 * 60 + 30 : 10 * 60) + r(3) * 120;
      t = ag[0].e;
      if (r(4) < (pens ? 0.65 : 0.45)) {
        const v = nearestOfType('shop', hB.doorX, hB.doorZ, id + day);
        if (v >= 0) goFlex(A.SHOP, ven(v).b, v, 15 + r(5) * 25);
      }
      if (pens && r(6) < 0.08) {
        const v = nearestOfType('clinic', hB.doorX, hB.doorZ, 0);
        if (v >= 0) goFlex(A.CLINIC, ven(v).b, v, 60 + r(8) * 60);
      }
      const pWalk = mat ? 0.9 : pens ? 0.5 : weekend ? 0.55 : 0.35;
      if (r(9) < pWalk) {
        const start = Math.max(t + 30, base + (r(10) < 0.5 ? 11 * 60 : 15 * 60) + r(11) * 90);
        pushHomeUntilIfHome(start);
        ag.push(item(r(12) < (pens ? 0.6 : 0.45) ? A.PARK : A.PROM, -1, -1, start, start + 50 + r(13) * 70));
        t = ag[ag.length - 1].e;
      }
      if (weekend && !pens && r(14) < 0.3) {
        const o = randomHomeOfRel(id, [4, 3, 2, 1]);
        if (o >= 0) { const s = Math.max(t + 20, base + 14 * 60 + r(15) * 120); pushHomeUntilIfHome(s); ag.push(item(A.VISIT, pop.home[o], -1, s, s + 90 + r(16) * 90)); ag[ag.length - 1].who = o; t = ag[ag.length - 1].e; }
      }
      if (!pens || r(17) < 0.25) eveOuting(t + 40);
    }
    // домой и спать
    sleepT = Math.max(sleepT, t + 30);
    if (shift === 'night' && works) sleepT = t + 40 + r(18) * 40;
    if (shift === 'evening' && works) sleepT = Math.max(t + 30, sleepT);
    const last = ag[ag.length - 1];
    if (last.a === A.HOME && last.b === home) last.e = sleepT;
    else ag.push(item(A.HOME, home, -1, t, sleepT));
    // сон до следующего подъёма
    let nextWake = (day + 1) * 1440 + pop.wake[id] + (((day + 1) % 7 + 7) % 7 >= 5 ? 60 + r(19) * 90 : 0);
    // будильник: успеть собраться и дойти к завтрашней смене
    if (LC.worksToday(id, day + 1) && P.at !== 'none' && P.at !== 'home' && shift !== 'night') {
      const tomorrowB = P.street === 'bus' || P.street === 'van' ? (LC.traffic ? LC.traffic.depotB : home) : workB;
      if (tomorrowB >= 0 && tomorrowB !== home) {
        const tr2 = estTrip(id, home, tomorrowB);
        const leave2 = (day + 1) * 1440 + pop.shiftS[id] - tr2 * margin - buffer;
        nextWake = Math.min(nextWake, leave2 - 25 - H(id, day + 1, 3) * 30);
      }
    }
    if (shift === 'night' && works) nextWake = sleepT + 420 + r(20) * 60;
    if (nextWake < sleepT + 240) nextWake = sleepT + 240 + r(21) * 60;
    ag.push(item(A.SLEEP, home, -1, sleepT, nextWake));
    // проверка: время ухода не раньше начала
    for (const it of ag) if (it.e < it.s + 2) it.e = it.s + 2;
    return ag;
  }
  S.genAgenda = genAgenda;

  // ================================================================
  // Что с человеком сейчас — для карточки и нейросети
  // ================================================================
  S.status = function (id) {
    if (pop !== LC.pop) sync();
    S._cur = id;
    const st = S.st[id], act = S.act[id];
    const tr = S.trip[id];
    const ag = S.ag[id];
    const it = ag ? ag[S.agi[id]] : null;
    const female = pop.sex[id] === 1;
    const g = (s) => LC.g(s, female);
    const placeName = (it2) => {
      if (!it2) return '';
      if (it2.v >= 0) return LC.venueName(it2.v);
      if (it2.b === pop.home[id]) return 'дом';
      if (it2.who != null) return LC.name(it2.who);
      return '';
    };
    let text = '', kind = 'in';
    if (st === ST.IN) {
      const v = S.inV[id];
      if (act === A.SLEEP) text = 'спит';
      else if (S.inB[id] === pop.home[id] && v < 0) text = 'дома';
      else if (act === A.VISIT && it && it.who != null) text = 'в гостях у ' + LC.whoLabel(id, it.who, 'gen');
      else if (v >= 0) text = S.whereAt(act, v);
      else text = ACT_WHERE[act];
    } else if (st === ST.STAND) {
      kind = 'out';
      if (act === A.SMOKE) text = g('выш{ел|ла} покурить ') + (S.standV[id] >= 0 ? LC.venueIn(S.standV[id]).replace(/^в /, 'у входа в ').replace(/^— /, 'у входа — ') : 'у входа');
      else if (act === A.STREET) text = pop.prof[id] === S.courierProf ? 'отдаёт заказ у двери' : D.professions[pop.prof[id]].street === 'musician' ? 'играет для прохожих' : D.professions[pop.prof[id]].street === 'promoter' ? 'раздаёт листовки' : 'стоит на улице';
      else text = 'ждёт у турникетов метро';
    } else if (st === ST.METRO) {
      kind = 'metro';
      const L = tr && tr.legs[tr.li];
      text = 'едет в метро' + (L ? ' до станции «' + city.stations[L.b].name + '»' : '');
    } else if (st === ST.CAR) {
      kind = 'car';
      text = act === A.STREET ? (D.professions[pop.prof[id]].street === 'taxi' ? 'таксует по городу' : D.professions[pop.prof[id]].street === 'bus' ? 'ведёт автобус по маршруту' : 'развозит заказы') : 'за рулём, едет ' + ACT_TO[act];
    } else {
      kind = 'out';
      if (act === A.PARK) text = 'гуляет в парке';
      else if (act === A.PROM) text = 'гуляет по набережной';
      else if (act === A.STREET) text = pop.prof[id] === S.courierProf ? 'бежит с заказом' : D.professions[pop.prof[id]].street === 'sweeper' ? 'метёт тротуары' : D.professions[pop.prof[id]].street === 'patrol' ? 'патрулирует район' : 'работает на улице';
      else {
        const L = tr && tr.legs[tr.li];
        const toMetro = tr && tr.legs[tr.li + 1] && tr.legs[tr.li + 1].k === 'metro';
        const toCar = tr && tr.legs[tr.li + 1] && tr.legs[tr.li + 1].k === 'car';
        const dest = it ? S.whereTo(act, it) : '';
        text = g('идёт ') + dest;
        if (toMetro && L) text = g('идёт к метро «') + city.stations[tr.legs[tr.li + 1].a].name + '», дальше ' + ACT_TO[act];
        if (toCar) text = g('идёт к своей машине, потом ') + ACT_TO[act];
        if (st === ST.WAIT) text = 'ждёт зелёный свет, ' + (dest ? 'путь ' + ACT_TO[act] : 'на переходе');
      }
    }
    // опоздание
    let late = null;
    if (it && it.fx && LC.clock.t > it.s + 2 && S.st[id] !== ST.IN && (it.a === A.WORK || it.a === A.DATE || it.a === A.STUDY)) late = Math.round(LC.clock.t - it.s);
    return { text, kind, late, act, place: placeName(it) };
  };

  // «в баре «Сова»», «на работе — Школа № 5»
  S.whereAt = function (act, v) {
    const vin = LC.venueIn(v), dash = vin[0] === '—';
    switch (act) {
      case A.WORK: return 'на работе ' + (dash ? vin : '— ' + LC.venueName(v));
      case A.STUDY: return 'на учёбе ' + (dash ? vin : '— ' + LC.venueName(v));
      case A.LUNCH: return 'обедает ' + vin;
      case A.DATE: return 'на свидании ' + vin;
      case A.BAR: return dash ? 'отдыхает ' + vin : vin;
      case A.CAFE: return dash ? 'сидит в кафе ' + vin : vin;
      case A.GYM: return 'на тренировке ' + vin;
      case A.CULTURE: return 'на вечернем сеансе ' + vin;
      case A.SHOP: return 'в магазине ' + vin;
      case A.CLINIC: return 'на приёме у врача ' + vin;
      default: return ACT_WHERE[act] + ' ' + vin;
    }
  };
  S.whereTo = function (act, it) {
    const v = it.v;
    if (act === A.VISIT && it.who != null) return 'в гости к ' + LC.whoLabel(it.b >= 0 ? S._cur : 0, it.who, 'dat');
    if (act === A.HOME || act === A.SLEEP) return 'домой';
    if (v < 0) return ACT_TO[act];
    const vto = LC.venueTo(v), dash = vto[0] === '—';
    switch (act) {
      case A.WORK: return 'на работу ' + (dash ? vto : '— ' + LC.venueName(v));
      case A.STUDY: return 'на учёбу ' + (dash ? vto : '— ' + LC.venueName(v));
      case A.LUNCH: return 'на обед ' + vto;
      case A.DATE: return 'на свидание ' + vto;
      case A.BAR: case A.CAFE: return dash ? ACT_TO[act] + ' ' + vto : vto;
      default: return ACT_TO[act] + ' ' + vto;
    }
  };

  // распорядок в читаемом виде
  S.agendaText = function (id) {
    if (pop !== LC.pop) sync();
    const ag = S.ag[id];
    if (!ag) return [];
    return ag.map((it) => {
      let where = '';
      if (it.a === A.SLEEP) where = 'сон';
      else if (it.a === A.HOME) where = 'дома';
      else if (it.a === A.PARK) where = 'прогулка в парке';
      else if (it.a === A.PROM) where = 'прогулка по набережной';
      else if (it.a === A.STREET) where = 'работа на улице';
      else if (it.a === A.VISIT) where = 'в гостях' + (it.who != null ? ' у ' + LC.whoLabel(id, it.who, 'gen') : '');
      else if (it.v >= 0) where = S.whereAt(it.a, it.v);
      else where = ACT_WHERE[it.a];
      return { a: it.a, s: it.s, e: it.e, where, fx: it.fx };
    });
  };

  // сколько людей где — для счётчиков
  S.counts = function () {
    if (pop !== LC.pop) sync();
    const N = pop.n;
    let walk = 0, car = 0, metro = 0, home = 0, sleep = 0;
    for (let id = 0; id < N; id++) {
      const s = S.st[id];
      if (s === ST.WALK || s === ST.WAIT || s === ST.STAND) walk++;
      else if (s === ST.CAR) car++;
      else if (s === ST.METRO) metro++;
      else if (S.inB[id] === pop.home[id] && S.inV[id] < 0) { home++; if (S.act[id] === A.SLEEP) sleep++; }
    }
    return { walk, car, metro, home, sleep, other: N - walk - car - metro - home };
  };
})(window.LC);
