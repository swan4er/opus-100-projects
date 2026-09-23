/* ================================================================
   Участковый · интерфейс и ход игры
   Ход: реплика игрока → мастер (JSON) → бросок d20 → код проверяет и применяет
   → реплика персонажа потоком → время идёт → мир отвечает событиями.
   ================================================================ */
window.U = window.U || {};

U.UI = (function () {
  'use strict';
  const E = U.Engine, D = U.DATA, M = U.Master, SC = U.Scene;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const T = (s) => esc(E.typo(s));
  const S = () => E.S;
  // режим съёмки: SHOT0 — как страница открылась (обложка), shot() — сейчас (тест может выключить)
  const SHOT0 = !!(window.AI && AI.shot);
  const shot = () => !!(window.AI && AI.shot);
  let busy = false, phone = null, suspect = null, lastCost = -1;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- звук: тихие синтезированные сигналы ----------
  const snd = (() => {
    let ctx = null, master = null, on = true;
    const ensure = () => {
      if (ctx) return ctx;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination);
      } catch { ctx = null; }
      return ctx;
    };
    const tone = (f, t0, dur, type = 'sine', vol = 0.3, f2) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
    };
    const noise = (t0, dur, freq, vol) => {
      const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(master); s.start(t0);
    };
    const play = (fn) => { if (!on || !ensure() || ctx.state !== 'running') return; try { fn(ctx.currentTime); } catch {} };
    return {
      unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
      toggle() { on = !on; if (on) this.unlock(); return on; },
      get on() { return on; },
      dice() { play((t) => { for (let i = 0; i < 9; i++) noise(t + i * 0.1 + Math.random() * 0.04, 0.05, 1800 + Math.random() * 1400, 0.5 - i * 0.04); }); },
      ok() { play((t) => { tone(523, t, 0.25, 'triangle', 0.25); tone(784, t + 0.1, 0.4, 'triangle', 0.22); }); },
      no() { play((t) => { tone(220, t, 0.35, 'triangle', 0.25, 150); }); },
      clue() { play((t) => { noise(t, 0.09, 300, 0.9); tone(98, t, 0.18, 'sine', 0.4); tone(660, t + 0.12, 0.3, 'sine', 0.12); }); },
      ring() { play((t) => { for (let k = 0; k < 2; k++) for (let i = 0; i < 10; i++) { tone(1320, t + k * 0.9 + i * 0.045, 0.04, 'sine', 0.12); tone(1650, t + k * 0.9 + i * 0.045 + 0.02, 0.04, 'sine', 0.08); } }); },
      step() { play((t) => noise(t, 0.04, 900, 0.18)); },
      fx(name) {
        play((t) => {
          if (name === 'fire') { noise(t, 0.8, 500, 1.2); tone(90, t, 0.7, 'sawtooth', 0.12, 50); }
          else if (name === 'splash') { noise(t, 0.5, 1200, 0.9); noise(t + 0.15, 0.4, 700, 0.6); }
          else if (name === 'horn') { tone(196, t, 0.9, 'sawtooth', 0.12); tone(247, t, 0.9, 'sawtooth', 0.1); }
          else if (name === 'crows') { for (let i = 0; i < 4; i++) tone(700, t + i * 0.22, 0.14, 'sawtooth', 0.06, 420); }
          else if (name === 'hut_turn') { for (let i = 0; i < 8; i++) noise(t + i * 0.25, 0.12, 250, 0.6); tone(140, t, 1.8, 'triangle', 0.05, 120); }
          else if (name === 'stove') { noise(t, 0.3, 300, 0.8); tone(110, t, 0.3, 'sine', 0.3); }
          else { noise(t, 0.4, 400, 0.6); }
        });
      },
    };
  })();

  // ---------- портреты-кружки ----------
  const initials = (id) => (id === 'player' ? 'Я' : id === 'kot' ? 'К' : D.CHARS[id].name.slice(0, 2));
  const av = (id, cls = 'av') => {
    const c = D.CHARS[id];
    return `<span class="${cls}" style="background:${c ? c.color : '#1E1C1F'}">${esc(initials(id))}</span>`;
  };

  // ---------- журнал ----------
  function push(entry) {
    if (!shot()) { S().tx = S().tx || []; S().tx.push(entry); if (S().tx.length > 70) S().tx.splice(0, S().tx.length - 70); }
    return render(entry);
  }
  function render(e) {
    const log = $('#log');
    const el = document.createElement('div');
    el.className = 'm m-' + e.k;
    if (e.k === 'sys') el.innerHTML = T(e.text).replace(/^([^·]+)·/, '<b>$1</b>·');
    else if (e.k === 'me') el.innerHTML = `<span class="lbl">${e.phone ? 'Вы — в трубку' : 'Участковый'}</span>${T(e.text)}`;
    else if (e.k === 'narr') el.innerHTML = T(e.text);
    else if (e.k === 'err') el.innerHTML = T(e.text);
    else if (e.k === 'npc') { el.innerHTML = `${av(e.id)}<span class="nm" style="color:${D.CHARS[e.id].color}">${esc(D.CHARS[e.id].full)}</span><span class="tx"></span>`; fillNpc(el, e.id, e.text || '', false); }
    else if (e.k === 'roll') el.innerHTML = rollHTML(e.r);
    else if (e.k === 'clue') el.innerHTML = `<span class="stampmark">${e.egg ? 'Изъято' : 'Улика'}</span><br>${T(e.text)}`;
    else if (e.k === 'fx') el.innerHTML = e.chips.map((c) => `<span class="${c[1] || ''}">${T(c[0])}</span>`).join('');
    else if (e.k === 'quest') el.innerHTML = `<b>${e.done ? 'Заявление закрыто' : 'Новое заявление'} · ${T(e.title)}</b>${T(e.text)}`;
    else if (e.k === 'intro') { el.className = 'm m-quest m-intro'; el.innerHTML = e.html; }
    log.appendChild(el);
    log.scrollTop = e.k === 'intro' ? 0 : log.scrollHeight;
    return el;
  }
  function fillNpc(el, id, text, typing) {
    const tx = el.querySelector('.tx');
    if (id === 'gorynych') {
      const rows = text.split('\n').map((l) => l.trim()).filter(Boolean);
      tx.innerHTML = rows.map((l) => {
        const m = l.match(/^(Го|Ры|Ныч)\s*:\s*(.*)$/);
        return m ? `<span class="head"><i>${m[1]}</i>${T(m[2])}</span>` : `<span class="head">${T(l)}</span>`;
      }).join('') + (typing ? '<span class="caret"></span>' : '');
      const lastHead = [...text.matchAll(/(?:^|\n)(Го|Ры|Ныч)\s*:/g)].pop();
      if (SC.ok) SC.speaking(typing ? 'gorynych' : null, lastHead ? lastHead[1] : null);
    } else {
      tx.innerHTML = T(text) + (typing ? '<span class="caret"></span>' : '');
    }
    const log = $('#log');
    log.scrollTop = log.scrollHeight;
  }
  const DIE = '<svg viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 2l-4 8h8zM3 7l5 3M21 7l-5 3M8 10l-5 7M16 10l5 7M8 10l4 12 4-12"/></svg>';
  function rollHTML(r) {
    const mods = r.mods.map((m) => `${m.v >= 0 ? '+' : '−'}${Math.abs(m.v)} ${esc(m.label)}`).join(', ');
    return `${DIE}<span><b>${esc(r.sk[0].toUpperCase() + r.sk.slice(1))}: ${r.d}</b> ${mods ? '(' + mods + ')' : ''} = ${r.total} против ${r.dc}${r.why ? `<span class="why">${T(r.why)}</span>` : ''}</span><span class="res ${r.ok ? 'ok' : 'no'}">${r.ok ? (r.d === 20 ? 'крит' : 'успех') : (r.d === 1 ? 'провал!' : 'неудача')}</span>`;
  }

  // ---------- верхняя панель ----------
  const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  const MOON = '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>';
  function hud() {
    const c = E.clock();
    $('#clockText').textContent = `${c.weekday}, ${c.hh}`;
    $('#clockIco').innerHTML = c.night || c.phase === 'вечер' ? MOON : SUN;
    const left = E.DEADLINE - S().time;
    $('#deadline').textContent = left > 0 ? `до четверга 9:00 — ${Math.floor(left / 60)} ч` : 'срок вышел';
    $('#authVal').textContent = S().auth;
    $('#authBar').style.width = S().auth + '%';
    $('#moneyVal').textContent = S().money + ' ₽';
    $('#demoBadge').hidden = !(window.AI && AI.demo) || shot();
    $('#clueCount').textContent = Object.keys(S().clues).length;
    $('#questCount').textContent = S().quests.filter((q) => q.status === 'active').length;
    cost();
    if (SC.ok) SC.setDrunk(E.drunk() ? Math.min(1, (S().drunkUntil - S().time) / 120) : 0);
  }
  function cost() {
    const v = window.AI ? AI.usage.costUSD : 0;
    if (v === lastCost) return;
    lastCost = v;
    $('#costVal').textContent = '$' + (v < 0.01 ? v.toFixed(4) : v.toFixed(3));
    $('#costBox').title = `Потрачено на нейросеть в этой сессии: $${v.toFixed(5)} · запросов: ${window.AI ? AI.usage.calls : 0}`;
    $('#menuCost').textContent = `нейросеть: $${v.toFixed(4)} · запросов: ${window.AI ? AI.usage.calls : 0}`;
  }

  // ---------- кто рядом ----------
  function ctx() {
    const loc = S().loc;
    return { loc, present: E.present(loc), to: phone ? 'polkan' : S().to, phone: !!phone };
  }
  function renderWho() {
    const loc = S().loc, c = E.clock();
    $('#placeName').textContent = D.LOCS[loc].name;
    const here = E.present(loc);
    $('#placeHint').textContent = here.length ? (S().to ? 'Говорите с: ' + D.CHARS[S().to].name : 'Кого спросить?') : 'Никого нет';
    const w = $('#who');
    w.innerHTML = '';
    for (const id of here) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = id === S().to ? 'on' : '';
      const a = S().att[id] || 0;
      b.innerHTML = `${av(id)}${esc(D.CHARS[id].name)} <small>${E.asleep(id) ? 'спит' : E.attLabel(a)}</small>`;
      b.addEventListener('click', () => pickChar(id));
      w.appendChild(b);
    }
    if (loc === 'square') {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `${av('kot')}Кот <small>видел всё</small>`;
      b.addEventListener('click', () => pickChar('kot'));
      w.appendChild(b);
    }
    void c;
    renderQuick();
  }
  function pickChar(id) {
    if (id === 'player') { SC.focus && SC.focus({ loc: S().loc }); return; }
    if (id === 'kot') {
      if (S().loc !== 'square') { goTo('square'); return; }
      if (S().inv.includes('sourcream')) { const h = E.feedCat(); push({ k: 'narr', text: h }); push({ k: 'fx', chips: [['Новая зацепка в деле', 'up']] }); after([]); }
      else push({ k: 'narr', text: 'Кот смотрит на вас как на протокол без подписи. Похоже, без сметаны разговора не будет.' });
      return;
    }
    const loc = E.whereIs(id);
    if (loc !== S().loc) { goTo(loc, id); return; }
    S().to = id;
    if (SC.ok) SC.focus({ char: id });
    renderWho();
    $('#input').focus({ preventScroll: true });
    $('#input').placeholder = `Что скажете: ${D.CHARS[id].name}? Или опишите действие`;
  }
  function renderQuick() {
    const q = $('#quick');
    const c = E.clock(), loc = S().loc, to = S().to;
    const acts = [];
    if (phone) acts.push(['Положить трубку', () => hangUp()]);
    else {
      if (to) {
        acts.push(['Где были ночью?', () => turn('Где вы были в ночь праздника, после полуночи?')]);
        acts.push(['Про яйцо', () => turn('Что вы знаете про пропажу яйца Кощея?')]);
        acts.push(['Показать удостоверение', () => { S().flags.badgeShown = to; turn('Показываю удостоверение: разговор официальный.'); }]);
      }
      acts.push(['Осмотреться', () => turn('Осматриваюсь по сторонам: что тут происходит?')]);
      acts.push(['Обыскать', () => turn('Внимательно обыскиваю это место.')]);
      if (loc === 'square') {
        if (c.hour >= 20 || c.hour < 6) acts.push(['Спать до утра', () => rest()]);
        acts.push(['Позвонить Полкану', () => callPolkan(true)]);
      }
      if (loc === 'shop' && c.hour >= 8 && c.hour < 21) acts.push(['Купить', () => tab('items')]);
      acts.push(['Ждать час', () => wait(60)]);
    }
    q.innerHTML = '';
    for (const [label, fn] of acts) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.addEventListener('click', () => { if (!busy) fn(); });
      q.appendChild(b);
    }
    q.scrollLeft = 0;
    quickEdge();
  }
  // лента быстрых действий: колесо мыши листает её вбок, край гаснет, пока есть что листать
  function quickEdge() { const q = $('#quick'); q.classList.toggle('end', q.scrollLeft + q.clientWidth >= q.scrollWidth - 4); }

  // ---------- время и мир ----------
  function syncWorld(instant) {
    if (SC.ok) {
      SC.setTime(S().time, instant);
      const where = {};
      for (const id in D.CHARS) if (!D.CHARS[id].phone) where[id] = E.whereIs(id);
      SC.placeAll(where, instant);
      const na = E.caseData().nightAct, h = E.clock().hour;
      SC.setNight(E.inNight(na, h) ? E.caseData().culprit : null, h >= 0 && h < 2);
    }
    hud();
  }
  async function after(events) {
    syncWorld(false);
    for (const ev of events || []) {
      if (ev.type === 'call' && !S().over) { ring(ev.day); autoQuest(); }
      if (ev.type === 'event') { push({ k: 'sys', text: 'Новости · ' + ev.text }); toast(ev.text); }
      if (ev.type === 'sober') toast('Хмель выветрился. Мир снова резкий.');
      if (ev.type === 'deadline' && !S().over) { E.finish('timeout'); }
    }
    renderWho(); renderCase(); renderQuests(); renderItems();
    if (!shot()) E.save();
  }

  // ---------- главный ход ----------
  async function turn(text, take) {
    text = String(text || '').trim();
    if (!text || busy || S().over) return;
    if (!S().flags.started) { await start(); if (!S().flags.started) return; }
    busy = true; setBusy(true);
    snd.unlock();
    const cx = ctx();
    const who = cx.to && D.CHARS[cx.to] ? cx.to : null;
    push({ k: 'me', text, phone: !!phone });
    E.note('Участковый: ' + text);
    // пока мастер думает — персонаж «думает» жестом
    const g = who ? D.CHARS[who].think : ['Посёлок прислушивается'];
    const wait = render({ k: 'narr', text: g[Math.floor(Math.random() * g.length)] + '…' });
    if (who && SC.ok) SC.thinking(who, true);
    let dec;
    try { dec = await M.decide(text, Object.assign({ take }, cx)); }
    catch (e) { dec = M.demoDecide(text, cx); aiError(e); }
    wait.remove();
    if (who && SC.ok) SC.thinking(who, false);

    // переход в другое место — движение игрока, без броска
    if (dec.type === 'move' && dec.move) {
      if (dec.ok.narr) push({ k: 'narr', text: dec.ok.narr });
      busy = false; setBusy(false);
      await goTo(dec.move);
      return;
    }
    // бросок d20
    let r = null;
    if (dec.roll) {
      const rTo = dec.to && dec.to !== 'polkan' ? dec.to : null;
      r = E.roll(dec.roll.sk, dec.roll.dc, rTo);
      r.why = dec.roll.why;
      if (dec.type === 'search') r.search = true;
      snd.dice();
      await (SC.ok ? Promise.race([SC.roll(r), sleep(2600)]) : sleep(500));
      push({ k: 'roll', r });
      r.ok ? snd.ok() : snd.no();
    }
    const br = r ? (r.ok ? dec.ok : dec.no) : dec.ok;
    const speaker = dec.to && (D.CHARS[dec.to] && (dec.to === 'polkan' ? !!phone : cx.present.includes(dec.to))) ? dec.to : null;
    if (speaker && speaker !== 'polkan' && speaker !== S().to) { S().to = speaker; renderWho(); }
    const res = E.apply(dec, br, r, { loc: cx.loc, present: cx.present, to: speaker, phone: !!phone });
    if (br.narr) { push({ k: 'narr', text: br.narr }); E.note('(' + br.narr + ')'); }
    else if (!speaker && !res.clues.length) {
      // говорить некому, а мастер промолчал — мир всё равно отвечает
      const t = br.dir || (dec.type === 'search' ? D.LOCS[cx.loc].search : 'Посёлок живёт своей жизнью: где-то хлопает калитка, лает собака.');
      push({ k: 'narr', text: t }); E.note('(' + t + ')');
    }
    if (res.fx && SC.ok) { SC.fx(res.fx); snd.fx(res.fx); }
    // персонаж отвечает потоком
    if (speaker) {
      const entry = { k: 'npc', id: speaker, text: '' };
      const el = render(entry);
      if (SC.ok && speaker !== 'polkan') SC.speaking(speaker);
      let text2 = '';
      try {
        text2 = await M.speak(speaker, dec, br, r, res, { loc: cx.loc, present: cx.present, to: speaker }, text, (full) => { text2 = full; fillNpc(el, speaker, full, true); });
      } catch (e) {
        aiError(e);
        text2 = await M.fake(D.DEMO[speaker] ? D.DEMO[speaker].other[0] : '…', (full) => fillNpc(el, speaker, full, true));
      }
      if (!text2) text2 = '…';
      fillNpc(el, speaker, text2, false);
      if (SC.ok) SC.speaking(null);
      entry.text = text2;
      if (!shot()) { S().tx = S().tx || []; S().tx.push(entry); }
      E.pushHist(speaker, 'user', 'Участковый: «' + text + '»');
      E.pushHist(speaker, 'assistant', text2);
      E.note(D.CHARS[speaker].name + ': ' + text2.replace(/\n/g, ' '));
    }
    // итоги хода
    for (const c of res.clues) { push({ k: 'clue', text: c.text, egg: c.id === 'egg' }); snd.clue(); pingTab('case'); }
    const chips = [];
    if (res.att) chips.push([`${D.CHARS[speaker]?.name || 'Собеседник'}: отношение ${res.att > 0 ? '+' : '−'}${Math.abs(res.att)}`, res.att > 0 ? 'up' : 'down']);
    if (res.auth) chips.push([`Авторитет ${res.auth > 0 ? '+' : '−'}${Math.abs(res.auth)}`, res.auth > 0 ? 'up' : 'down']);
    if (res.money) chips.push([`${res.money > 0 ? '+' : '−'}${Math.abs(res.money)} ₽`, res.money > 0 ? 'up' : 'down']);
    for (const it of res.items.filter((x) => x !== 'egg')) chips.push(['Получено: ' + D.ITEMS[it].name, 'up']);
    for (const it of res.lost) chips.push(['Отдано: ' + D.ITEMS[it].name, '']);
    for (const n of res.notes) chips.push([n, 'up']);
    if (res.rumor) chips.push(['Пошёл слух', '']);
    if (chips.length) push({ k: 'fx', chips });
    if (res.quest) { push({ k: 'quest', done: true, title: res.quest.title, text: 'Авторитет +5, отношение заявителя +2, премия 100 ₽.' }); snd.ok(); }
    const evs = E.advance(res.minutes);
    if (phone && speaker === 'polkan') { phone.turns = (phone.turns || 0) + 1; if (phone.turns >= 2) setTimeout(hangUp, 900); }
    await after(evs);
    busy = false; setBusy(false);
    if (res.move) goTo(res.move);
  }
  function setBusy(b) {
    $('#sendBtn').disabled = b;
    $('#quick').style.opacity = b ? '.5' : '';
  }
  function aiError(e) {
    const kind = e && e.kind;
    push({ k: 'err', text: (e && e.ru ? e.ru : 'Нейросеть не ответила') + ' — этот ход сыгран по заготовке.' });
    if (kind === 'auth' || kind === 'credits' || kind === 'nokey') { AI.demo = true; hud(); toast('Нейросеть недоступна — включён демо-режим.'); }
  }

  // ---------- перемещение ----------
  async function goTo(loc, thenTalk) {
    if (busy || !D.LOCS[loc] || S().over) return;
    if (!S().flags.started) { await start(); if (!S().flags.started) return; }
    if (loc === S().loc) { if (thenTalk) pickChar(thenTalk); else if (SC.ok) SC.focus({ loc }); return; }
    busy = true; setBusy(true);
    snd.unlock();
    const a = U.Town.P[S().loc], b = U.Town.P[loc];
    const dist = Math.hypot(a.stand[0] - b.stand[0], a.stand[1] - b.stand[1]);
    const minutes = Math.round(8 + dist * 0.9);
    if (phone) hangUp(true);
    if (SC.ok) { SC.focus({ loc }); }
    const walk = SC.ok ? Promise.race([SC.setPlayer(loc), sleep(6000)]) : Promise.resolve();
    const evs = E.moveTo(loc, minutes);
    await walk;
    const here = E.present(loc);
    const c = E.clock();
    push({ k: 'sys', text: `${D.LOCS[loc].name} · ${c.hh}` + (here.length ? ' · здесь: ' + here.map((id) => D.CHARS[id].name + (E.asleep(id) ? ' (спит)' : '')).join(', ') : ' · никого') });
    if (!S().seen[loc]) { S().seen[loc] = 1; push({ k: 'narr', text: D.LOCS[loc].desc }); }
    const na = E.caseData().nightAct;
    if (na.loc === loc && E.inNight(na, c.hour)) push({ k: 'narr', text: 'Где-то рядом, в темноте, кто-то возится и старается не шуметь. Стоит присмотреться.' });
    E.note(`(Участковый пришёл: ${D.LOCS[loc].name}, ${c.hh})`);
    busy = false; setBusy(false);
    await after(evs);
    if (thenTalk && E.whereIs(thenTalk) === loc) pickChar(thenTalk);
    else if (SC.ok) SC.focus({ loc });
  }
  async function wait(min) {
    if (busy) return;
    push({ k: 'sys', text: `Ждёте · ${min} мин` });
    await after(E.advance(min));
  }
  async function rest() {
    if (busy) return;
    const evs = E.sleep();
    push({ k: 'sys', text: 'Ночь в опорном пункте · ' + E.clock().label });
    push({ k: 'narr', text: 'Вы спите на трёх стульях под портретом неизвестного генерала. Снится Кощей: он ищет своё яйцо у вас в фуражке.' });
    await after(evs);
  }

  // ---------- Полкан на проводе ----------
  function ring(day) {
    if (shot() || S().calls[day] || phone) return;
    S().calls[day] = true;
    const p = $('#phone');
    $('#phoneSub').textContent = day === 1 ? 'звонит из района' : 'утренний звонок, день ' + day;
    p.hidden = false;
    snd.ring();
    const again = setInterval(() => { if (p.hidden) clearInterval(again); else snd.ring(); }, 2600);
    $('#phoneYes').onclick = () => { p.hidden = true; clearInterval(again); answer(day); };
    $('#phoneNo').onclick = () => {
      p.hidden = true; clearInterval(again);
      S().auth = E.clamp(S().auth - 3, 0, 100);
      E.log('Сбросил звонок полковника Полкана.');
      push({ k: 'fx', chips: [['Сбросили начальство: авторитет −3', 'down']] });
      hud();
    };
  }
  async function answer(day) {
    if (busy) { setTimeout(() => answer(day), 400); return; }
    busy = true; setBusy(true);
    phone = { day, turns: 0 };
    tab('talk');
    push({ k: 'sys', text: 'Телефон · полковник Полкан' });
    const entry = { k: 'npc', id: 'polkan', text: '' };
    const el = render(entry);
    let text = '';
    try { text = await M.call(day, (full) => { text = full; fillNpc(el, 'polkan', full, true); }); }
    catch (e) { aiError(e); text = await M.fake(D.POLKAN_CALLS[Math.min(day - 1, 2)], (full) => fillNpc(el, 'polkan', full, true)); }
    fillNpc(el, 'polkan', text, false);
    entry.text = text;
    if (!shot()) { S().tx = S().tx || []; S().tx.push(entry); }
    E.pushHist('polkan', 'assistant', text);
    E.log('Доложил полковнику Полкану по телефону.');
    E.advance(5);
    busy = false; setBusy(false);
    $('#input').placeholder = 'Ответить Полкану…';
    renderQuick(); hud();
    if (!shot()) E.save();
  }
  function callPolkan() {
    if (busy || phone) return;
    const d = E.clock().day;
    S().flags.selfCalls = (S().flags.selfCalls || 0) + 1;
    phone = { day: d, turns: 0 };
    push({ k: 'sys', text: 'Телефон · вы звоните полковнику Полкану' });
    $('#input').placeholder = 'Что доложите Полкану?';
    $('#input').focus({ preventScroll: true });
    renderQuick();
  }
  function hangUp(silent) {
    if (!phone) return;
    phone = null;
    if (!silent) push({ k: 'sys', text: 'Короткие гудки' });
    $('#input').placeholder = S().to ? `Что скажете: ${D.CHARS[S().to].name}?` : 'Что делаете или говорите?';
    renderQuick();
  }

  // ---------- вкладки ----------
  function tab(name) {
    document.querySelectorAll('.tabs button').forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); if (on) b.classList.remove('ping'); });
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'pane-' + name));
    if (name === 'talk') { const l = $('#log'); l.scrollTop = l.scrollHeight; quickEdge(); }
    if (name === 'case') renderCase();
    if (name === 'items') renderItems();
    if (name === 'quests') renderQuests();
  }
  function pingTab(name) {
    const b = document.querySelector(`.tabs button[data-tab="${name}"]`);
    if (b && !b.classList.contains('on')) b.classList.add('ping');
  }

  function renderCase() {
    const ul = $('#clueList');
    const ids = Object.keys(S().clues).sort((a, b) => S().clues[a].t - S().clues[b].t);
    ul.innerHTML = ids.length ? '' : '<li class="empty">Пока ничего. Начните с места преступления.</li>';
    for (const id of ids) {
      const c = E.clueById(id); if (!c) continue;
      const li = document.createElement('li');
      li.innerHTML = `<label><input type="checkbox" value="${id}"><span><span class="t">${E.clock(S().clues[id].t).weekday}, ${E.fmt(S().clues[id].t)} · ${c.who[0] === '@' ? D.LOCS[c.who.slice(1)].short : D.CHARS[c.who] ? D.CHARS[c.who].name : ''}</span>${T(c.text)}</span></label>`;
      ul.appendChild(li);
    }
    ul.querySelectorAll('input').forEach((i) => i.addEventListener('change', () => {
      const n = ul.querySelectorAll('input:checked').length;
      if (n > 3) i.checked = false;
      accuseState();
    }));
    const leads = $('#leadList');
    leads.innerHTML = S().leads.map((l) => `<li>${T(l)}</li>`).join('') || '<li class="empty">—</li>';
    const rum = $('#rumorList');
    rum.innerHTML = S().rumors.slice(-6).reverse().map((r) => `<li><span class="t">${E.clock(r.t).wd}, ${E.fmt(r.t)}</span> ${T(r.text)}</li>`).join('') || '<li class="empty">Пока о вас ничего не говорят. Это ненадолго.</li>';
    const sus = $('#suspects');
    sus.innerHTML = '';
    for (const id of ['yaga', 'leshy', 'vodyanoy', 'emelya', 'kikimora', 'gorynych', 'koschei']) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = suspect === id ? 'on' : '';
      b.innerHTML = `${av(id)}${esc(D.CHARS[id].name)}`;
      b.addEventListener('click', () => { suspect = suspect === id ? null : id; renderCase(); });
      sus.appendChild(b);
    }
    accuseState();
  }
  function accuseState() {
    const n = document.querySelectorAll('#clueList input:checked').length;
    $('#accuseBtn').disabled = !suspect || !n || !!S().over;
    $('#accuseNote').textContent = S().over ? 'Дело закрыто.' : S().accusations ? 'Одно обвинение уже было ошибочным. Следующая ошибка — конец службы.' : '';
  }
  async function accuse() {
    if (busy || !suspect) return;
    const ids = [...document.querySelectorAll('#clueList input:checked')].map((i) => i.value);
    const res = E.accuse(suspect, ids);
    const nm = D.CHARS[suspect].full;
    tab('talk');
    push({ k: 'sys', text: `Обвинение · ${nm}` });
    if (res.verdict === 'weak') {
      push({ k: 'npc', id: 'polkan', text: `Лейтенант! Это не доказательства, а сказки! Мне нужно минимум две настоящие улики против ${D.CHARS[suspect].fem ? 'неё' : 'него'}. Р-р-работай!` });
      push({ k: 'fx', chips: [['Авторитет −5', 'down']] });
    } else if (res.verdict === 'wrong') {
      push({ k: 'narr', text: `${D.CHARS[suspect].name} ${D.CHARS[suspect].fem ? 'оскорблена' : 'оскорблён'} до глубины души. Через десять минут об этом знает весь посёлок.` });
      push({ k: 'fx', chips: [['Авторитет −10', 'down'], [`${D.CHARS[suspect].name}: отношение −3`, 'down']] });
    }
    suspect = null;
    await after([]);
  }

  function renderQuests() {
    const ul = $('#questList');
    const qs = S().quests.slice().reverse();
    ul.innerHTML = qs.length ? '' : '<li class="empty">Журнал заявлений пуст. Загляните в него — жители всегда найдут, на что пожаловаться.</li>';
    for (const q of qs) {
      const li = document.createElement('li');
      li.className = q.status === 'done' ? 'done' : '';
      li.innerHTML = `<b>${T(q.title)}</b><p>${T(q.text)}</p><p>${T('Задача: ' + q.goal)}</p><div class="meta">${q.status === 'done' ? 'Закрыто' : 'От: ' + esc(D.CHARS[q.giver].name) + ' · ' + esc(D.LOCS[q.where].short)}</div>`;
      ul.appendChild(li);
    }
    const active = S().quests.filter((q) => q.status === 'active').length;
    $('#newQuestBtn').disabled = active >= 3;
    $('#questNote').textContent = active >= 3 ? 'Три открытых заявления — больше участковому не унести.' : '';
  }
  // утром кто-нибудь из жителей сам приносит заявление
  async function autoQuest() {
    if (S().quests.filter((q) => q.status === 'active').length >= 3) return;
    let q = null;
    try { q = await M.quest(); } catch { q = null; }
    if (!q) return;
    push({ k: 'quest', title: q.title, text: q.text });
    pingTab('quests'); toast(D.CHARS[q.giver].name + (D.CHARS[q.giver].fem ? ' принесла' : ' принёс') + ' заявление: ' + q.title);
    renderQuests(); hud();
  }
  async function newQuest() {
    const b = $('#newQuestBtn');
    if (b.disabled) return;
    b.disabled = true; b.textContent = 'Листаете журнал…';
    let q = null;
    try { q = await M.quest(); } catch (e) { aiError(e); }
    b.textContent = 'Проверить журнал заявлений';
    if (q) {
      push({ k: 'quest', title: q.title, text: q.text });
      toast('Новое заявление: ' + q.title);
      E.advance(10);
    } else toast('Сегодня заявлений нет. Подозрительно тихо.');
    await after([]);
  }

  const ICONS = {
    badge: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M13 10h4M13 13h4M6.5 16h5"/>',
    flashlight: '<path d="M8 3h8l-1 6H9zM9 9h6v11a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/><path d="M12 13v3"/>',
    beer: '<path d="M6 7h9v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M15 10h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2M6 7a3 3 0 0 1 4.5-3 3 3 0 0 1 4.5 3"/>',
    seeds: '<path d="M8 4c3 0 5 4 5 8s-2 8-5 8-5-4-5-8 2-8 5-8zM16 7c2 0 4 3 4 6s-2 6-4 6"/>',
    choco: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M5 9h14M5 15h14M12 3v18"/>',
    bagels: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/>',
    kvass: '<path d="M9 2h6v4l2 3v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l2-3z"/><path d="M7 13h10"/>',
    sourcream: '<path d="M6 8h12l-1.5 12h-9z"/><path d="M5 8h14M9 4h6v4H9z"/>',
    valerian: '<path d="M9 3h6v3H9zM8 6h8v14a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z"/><path d="M10 12h4M12 10v4"/>',
    egg: '<path d="M12 3c4 0 7 6 7 10.5A7 7 0 0 1 5 13.5C5 9 8 3 12 3z"/><path d="M12 8v8"/>',
  };
  function renderItems() {
    const ul = $('#itemList');
    ul.innerHTML = '';
    for (const id of S().inv) {
      const it = D.ITEMS[id];
      const li = document.createElement('li');
      li.innerHTML = `<span class="ic"><svg viewBox="0 0 24 24">${ICONS[id] || ICONS.badge}</svg></span><span class="tx"><b>${T(it.name)}</b><span>${T(it.desc)}</span></span>`;
      const act = itemAction(id);
      if (act) { const b = document.createElement('button'); b.type = 'button'; b.textContent = act[0]; b.addEventListener('click', act[1]); li.appendChild(b); }
      ul.appendChild(li);
    }
    const shop = $('#shop');
    const c = E.clock();
    const open = S().loc === 'shop' && E.whereIs('kikimora') === 'shop' && c.hour >= 8 && c.hour < 21;
    if (!open) { shop.innerHTML = S().loc === 'shop' ? '<h3>Магазин</h3><p class="note">Закрыто. Работаем с 8:00 до 21:00. Стучать бесполезно, Кикимора всё равно слышит.</p>' : '<h3>Магазин</h3><p class="note">Купить что-нибудь можно на почте у Кикиморы, с 8:00 до 21:00.</p>'; return; }
    shop.innerHTML = '<h3>Магазин «Продукты · Почта»</h3>';
    for (const id of D.SHOP) {
      const it = D.ITEMS[id];
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>${T(it.name)}</span><em>${it.price} ₽</em>`;
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Купить'; b.disabled = S().money < it.price;
      b.addEventListener('click', () => { if (E.buy(id)) { snd.step(); toast('Куплено: ' + it.name); renderItems(); hud(); } });
      row.appendChild(b); shop.appendChild(row);
    }
  }
  function itemAction(id) {
    const to = S().to;
    if (id === 'beer') return ['Выпить', async () => { if (busy) return; E.drink(); push({ k: 'narr', text: 'Вы выпиваете пиво «Тридевятое». Мир становится мягче, а камера — неувереннее.' }); push({ k: 'fx', chips: [['Обаяние +1 с выпивающими', 'up'], ['Сыск −2', 'down'], ['Пошёл слух', '']] }); tab('talk'); await after([]); }];
    if (id === 'sourcream' && S().loc === 'square') return ['Коту', () => { tab('talk'); pickChar('kot'); }];
    if (D.ITEMS[id].fixed || id === 'flashlight') return null;
    if (to && E.whereIs(to) === S().loc) return ['Угостить: ' + D.CHARS[to].name, () => { tab('talk'); turn(`Угощаю: держите, это вам — ${D.ITEMS[id].name}.`, id); }];
    return null;
  }

  // ---------- окно, тост, меню ----------
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = E.typo(msg); t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200);
  }
  function modal(html) {
    const m = $('#modal');
    $('#modalSheet').innerHTML = html;
    m.hidden = false;
    return $('#modalSheet');
  }
  function closeModal() { $('#modal').hidden = true; }
  function help() {
    const sh = modal(`<h2>Как служить</h2>
      <p>${T('Вы — новый участковый ПГТ Тридевятое. У Кощея украли смерть: яйцо с иглой. Срок — до четверга, 9:00.')}</p>
      <ul class="rules">
        <li>${T('Пишите что угодно свободным текстом: вопросы, угрозы, комплименты, «лезу на крышу», «угощаю Лешего пивом». Мастер игры — нейросеть — решает, что из этого выйдет.')}</li>
        <li>${T('Когда исход неочевиден, мастер назначает бросок d20: навык и сложность. Кубик бросает код, честно и на виду.')}</li>
        <li>${T('Каждый житель помнит ваши прошлые разговоры и слышит сплетни. Грубость и подарки не забываются.')}</li>
        <li>${T('Улики попадают в папку «Дело» только когда их по правилам выдал персонаж или вы их нашли. Для обвинения нужны две настоящие.')}</li>
        <li>${T('Днём и ночью посёлок живёт по-разному: кто-то спит, кто-то ночью делает то, что днём скрывает.')}</li>
        <li>${T('Заявления жителей — побочные дела. Решите — вырастет авторитет, и с вами станут разговорчивее.')}</li>
      </ul>
      <div class="btns"><button class="big-btn blue" type="button" id="mClose">Понятно</button></div>`);
    sh.querySelector('#mClose').onclick = closeModal;
  }
  async function ending() {
    const o = S().over;
    if (!o) return;
    const win = o.kind === 'best' || o.kind === 'good';
    const sc = E.caseData();
    const sh = modal(`<div class="verdict ${win ? 'good' : 'bad'}">${win ? 'Дело раскрыто' : o.kind === 'fired' ? 'Отстранён' : 'Срок истёк'}</div>
      <h2>${esc(sc.title)}</h2>
      <p>${T(M.verdictText(o.kind))}</p>
      <div id="confess"></div>
      <div class="protocol" id="protocol"><span class="caret"></span></div>
      <div class="btns"><button class="big-btn" type="button" id="mNew">Новое дело</button><button class="big-btn ghost" type="button" id="mClose">Посмотреть на посёлок</button></div>`);
    sh.querySelector('#mNew').onclick = () => { closeModal(); newGame(); };
    sh.querySelector('#mClose').onclick = closeModal;
    const conf = sh.querySelector('#confess');
    if (win) {
      conf.className = 'm m-npc';
      conf.innerHTML = `${av(sc.culprit)}<span class="nm" style="color:${D.CHARS[sc.culprit].color}">${esc(D.CHARS[sc.culprit].full)}</span><span class="tx"></span>`;
      if (SC.ok) { SC.focus({ char: sc.culprit }); SC.speaking(sc.culprit); }
      try { await M.confession(sc.culprit, (full) => fillNpc(conf, sc.culprit, full, true)).then((t) => fillNpc(conf, sc.culprit, t, false)); }
      catch (e) { fillNpc(conf, sc.culprit, '…', false); }
      if (SC.ok) SC.speaking(null);
    }
    const pr = sh.querySelector('#protocol');
    const put = (t, typing) => { pr.innerHTML = T(t) + (typing ? '<span class="caret"></span>' : '') + (typing ? '' : `<span class="seal">${win ? 'Раскрыто' : 'Не раскрыто'}</span>`); };
    try { const t = await M.protocol(o.kind, (full) => put('ПРОТОКОЛ\n' + full, true)); put('ПРОТОКОЛ\n' + t, false); }
    catch (e) { put('ПРОТОКОЛ\n' + M.verdictText(o.kind), false); }
    hud();
  }

  // ---------- начало партии ----------
  function introCard() {
    return `<b>Дело № 1 · Кощеева смерть</b>
      <p>${T('Понедельник, 08:40. Вы — новый участковый ПГТ Тридевятое. Ночью на юбилее Кощея из сейфа пропало его яйцо, а в нём — его смерть. Бессмертный впервые за 777 лет боится сквозняков.')}</p>
      <p class="dim">${T('Пишите что угодно: за посёлок отвечает мастер игры — нейросеть, за кубик и правила — код.')}</p>
      <div class="btns"><button type="button" class="big-btn blue" data-start>Выйти из автобуса</button><button type="button" class="big-btn ghost" data-help>Как играть</button></div>`;
  }
  // до начала партии лишние кнопки не нужны: всё внимание на карточку дела
  function preState() { document.body.classList.toggle('pre', !S().flags.started); }
  function bindIntro() {
    document.querySelectorAll('[data-start]').forEach((b) => { b.onclick = () => start(); });
    document.querySelectorAll('[data-help]').forEach((b) => { b.onclick = help; });
  }
  async function start() {
    if (S().flags.started) return;
    snd.unlock();
    if (window.AI) await AI.ensureKey();
    S().flags.started = true;
    preState();
    document.querySelectorAll('[data-start]').forEach((b) => { b.disabled = true; b.textContent = 'Дело принято'; });
    push({ k: 'sys', text: 'Понедельник · 08:40 · площадь' });
    push({ k: 'narr', text: 'Автобус пыхтит и уезжает. Памятник Колобку смотрит на вас с подозрением. В кармане звонит телефон.' });
    hud();
    E.save();
    ring(1);
    M.prefetchQuest();
  }
  function newGame() {
    E.wipe();
    E.newGame();
    phone = null; suspect = null;
    $('#log').innerHTML = '';
    render({ k: 'intro', html: introCard() }); bindIntro(); preState();
    if (SC.ok) {
      SC.hideDice(); SC.speaking(null);
      for (const id in D.CHARS) SC.thinking(id, false);
      SC.setPlayer('square', true); SC.focus('overview');
    }
    syncWorld(true);
    after([]);
  }
  function restore() {
    $('#log').innerHTML = '';
    const tx = S().tx || [];
    if (!S().flags.started) { render({ k: 'intro', html: introCard() }); bindIntro(); }
    for (const e of tx.slice(-40)) render(e);
    if (S().flags.started) render({ k: 'sys', text: 'С возвращением · ' + E.clock().label });
    preState();
  }

  // ---------- кадр для обложки (режим съёмки) ----------
  function shotPreset() {
    E.newGame('yaga');
    const s = S();
    s.time = 1440 + 18 * 60 + 50; s.loc = 'dealership'; s.to = 'gorynych';
    s.flags.started = true; s.auth = 54; s.money = 380; s.att.gorynych = 1; s.att.koschei = 2;
    s.clues.y_scene = { t: 1440 + 16 * 60 + 55, via: '@dealership' };
    s.clues.y_gory = { t: 1440 + 18 * 60 + 50, via: 'gorynych' };
    s.inv.push('beer', 'choco');
    s.quests.push({ id: 'q1', title: 'Спор о шарфе', giver: 'gorynych', where: 'dealership', text: 'Горынычу прислали один шарф на три шеи. Головы не разговаривают второй день.', goal: 'Помирить головы.', secret: '', status: 'active', t: s.time });
    s.leads.push('Кто в посёлке летает с метлой?');
    const lines = [
      { k: 'sys', text: 'Автосалон «Бессмертный» · 18:50 · здесь: Кощей, Горыныч, Емеля' },
      { k: 'me', text: 'Так. Кто из вас троих спал на посту? Только честно, я всё равно узнаю.' },
      { k: 'roll', r: { sk: 'обаяние', dc: 12, d: 15, mods: [{ label: 'обаяние', v: 1 }, { label: 'симпатия', v: 1 }], total: 17, ok: true, why: 'Разговорить охрану по-хорошему' } },
      { k: 'narr', text: 'Средняя голова пытается выглядеть бодро. Левая уже сдалась.' },
      { k: 'npc', id: 'gorynych', text: 'Го: Да мы после Ягиной настойки враз и сомлели! Валерьянка с полынью… и что-то ещё, сонное.\nРы: Не сомлели, а бдили с закрытыми глазами!\nНыч: Сон — это просто бдение, которое устало…' },
      { k: 'clue', text: 'Все три головы Горыныча уснули сразу после подарочной настойки Яги. Го помнит вкус: валерьянка, полынь и «что-то сонное».' },
      { k: 'fx', chips: [['Горыныч: отношение +1', 'up'], ['Пошёл слух', '']] },
    ];
    lines.forEach(render);
    renderWho(); renderCase(); renderQuests(); renderItems(); hud();
  }

  // ---------- размеры сцены под интерфейс ----------
  function freeRect() {
    const w = window.innerWidth, h = window.innerHeight;
    if (w <= 820) return { x: 0, y: 70, w, h: Math.max(200, h * 0.44 - 70) };
    return { x: 0, y: 0, w: Math.max(300, w - 440 - 32), h };
  }

  // ---------- запуск ----------
  function initScene() {
    if (SC.ok || !window.THREE) return;
    const t0 = performance.now();
    try {
      SC.setFree(freeRect());
      SC.init({ canvas: $('#scene'), sky: $('#sky'), labels: $('#labels'), diceCap: $('#diceCap') });
      window.__uchInit = { build: Math.round(performance.now() - t0) };
    } catch (e) {
      console.error(e);
      $('#noThree').hidden = false;
      return;
    }
    SC.onPick = (p) => { if (p.type === 'loc') goTo(p.id); else pickChar(p.id); };
    const avoid = () => { SC.avoid = ['.brand', '.clock', '.stats', '.folder', '.demo-badge', '.phone'].map((q) => document.querySelector(q)).filter((el) => el && !el.hidden && el.offsetParent !== null).map((el) => el.getBoundingClientRect()); };
    SC.onResize = () => { SC.setFree(freeRect()); avoid(); };
    avoid(); setInterval(avoid, 1000);
    SC.setPlayer(S().loc, true);
    syncWorld(true);
    if (SHOT0 && shot()) {
      SC.focus({ char: 'gorynych', zoom: window.innerWidth <= 820 ? 2.6 : 2.7 }, true);
      SC.speaking('gorynych', 'Го');
      SC.thinking('koschei', true);
      setTimeout(() => { if (shot()) SC.roll({ sk: 'обаяние', dc: 12, d: 15, mods: [{ label: 'обаяние', v: 1 }, { label: 'симпатия', v: 1 }], total: 17, ok: true, hold: true }); }, 300);
    } else if (S().to && E.whereIs(S().to) === S().loc) SC.focus({ char: S().to }, true);
    else SC.focus(S().flags.started ? { loc: S().loc } : 'overview', true);
  }
  function boot() {
    // меню и кнопки
    $('#sayForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#input').value; if (!v.trim() || busy) return; $('#input').value = ''; turn(v); });
    $('#input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#sayForm').requestSubmit(); } });
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => tab(b.dataset.tab)));
    $('#accuseBtn').addEventListener('click', accuse);
    $('#newQuestBtn').addEventListener('click', newQuest);
    $('#soundBtn').setAttribute('aria-pressed', 'true');
    $('#soundBtn').addEventListener('click', () => { const on = snd.toggle(); $('#soundBtn').setAttribute('aria-pressed', on ? 'true' : 'false'); });
    const menu = $('#menu');
    $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; $('#menuBtn').setAttribute('aria-expanded', !menu.hidden); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
    menu.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.act; if (!a) return;
      menu.hidden = true;
      if (a === 'overview' && SC.ok) SC.focus('overview');
      if (a === 'help') help();
      if (a === 'new') newGame();
      if (a === 'demo') { AI.demo = true; hud(); toast('Демо-режим: жители отвечают заготовками.'); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); menu.hidden = true; } });
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    $('#grip').addEventListener('click', () => $('#folder').classList.toggle('tall'));
    $('#quick').addEventListener('scroll', quickEdge, { passive: true });
    $('#quick').addEventListener('wheel', (e) => { const q = $('#quick'); if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && q.scrollWidth > q.clientWidth) { e.preventDefault(); q.scrollLeft += e.deltaY; } }, { passive: false });
    window.addEventListener('resize', quickEdge);
    // шрифты догрузились — высота реплик изменилась, журнал снова прокручиваем к последней
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const l = $('#log'); if (S().flags.started) l.scrollTop = l.scrollHeight; quickEdge(); });
    document.addEventListener('pointerdown', () => snd.unlock(), { once: true });
    E.on('end', () => { setTimeout(ending, 400); });

    // состояние
    // в режиме съёмки программный рендер занимает поток — плавная прокрутка не успевает, обложка должна быть точной
    if (SHOT0) document.documentElement.classList.add('shot');
    if (SHOT0) shotPreset();
    else if (E.load()) { restore(); }
    else { E.newGame(); render({ k: 'intro', html: introCard() }); bindIntro(); preState(); }
    if (!SHOT0) { renderWho(); renderCase(); renderQuests(); renderItems(); hud(); }
    if (S().over && !SHOT0) setTimeout(ending, 300);

    // три.js
    window.addEventListener('three-ready', initScene);
    setTimeout(() => { if (!SC.ok && window.THREE && document.readyState === 'complete') initScene(); }, 4000);
    setTimeout(() => { if (!SC.ok) $('#noThree').hidden = false; }, 12000);
    setInterval(cost, 1500);
    // тестовый крючок: живая сессия из инструмента съёмки
    window.__uch = {
      live() { AI.shot = false; AI.demo = !AI.hasKey(); S().flags.started = true; preState(); E.save(); hud(); return !AI.demo; },
      fresh() { AI.shot = false; newGame(); return true; },
      time(t) { S().time = t; syncWorld(true); renderWho(); return E.clock().label; },
      turn, goTo, pickChar, state: () => S(), usage: () => AI.usage,
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  return { turn, goTo, toast };
})();
