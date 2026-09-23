/* ================================================================
   Тихоречинск — интерфейс: часы и скорость, счётчики, карточка жителя
   (факты, распорядок, связи, разговор), газета, поиск, тосты.
   ================================================================ */
(function (LC) {
  'use strict';
  const D = window.LC_DATA;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => LC.esc(s);
  const nb = (s) => LC.nbsp(esc(s));
  const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const UI = LC.ui = {};

  // цвета занятий на шкале дня
  const ACT_COL = ['#2a3040', '#4a5567', '#8fbcd0', '#d9a066', '#f2a541', '#8fc486', '#c9a0d8', '#d9a066', '#cdbb8a', '#e8a598', '#6fae7a', '#6fae7a', '#8fbcd0', '#e2553d', '#8fbcd0', '#9fc6c0', '#f2a541'];
  UI.ACT_COL = ACT_COL;

  // ---------------- тост ----------------
  let toastT = 0;
  UI.toast = function (text, ms) {
    const el = $('toast');
    el.innerHTML = nb(text);
    el.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('on'), ms || 3200);
  };

  // ---------------- скорость времени ----------------
  function setSpeed(v) {
    LC.clock.paused = v === 0;
    if (v > 0) LC.clock.speed = v;
    for (const b of document.querySelectorAll('.speed button')) b.classList.toggle('on', +b.dataset.speed === v);
  }
  UI.setSpeed = setSpeed;
  document.querySelector('.speed').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setSpeed(+b.dataset.speed);
  });

  // ---------------- часы и счётчики ----------------
  let cntT = 0;
  function tick() {
    const c = LC.clock;
    $('c-day').textContent = LC.DAYS_SHORT[c.weekday];
    $('c-time').textContent = LC.fmt(c.min);
    const now = performance.now();
    if (now - cntT > 900) {
      cntT = now;
      const k = LC.life.counts();
      $('n-walk').textContent = num(k.walk);
      $('n-car').textContent = num(LC.traffic.countMoving());
      $('n-metro').textContent = num(k.metro);
      $('n-home').textContent = num(k.home);
    }
    if (UI.cur >= 0) refreshCard(false);
    if (window.AI) $('ai-cost').textContent = AI.usage.calls ? '$' + AI.usage.costUSD.toFixed(4) : '';
  }

  // ---------------- статус нейросети ----------------
  UI.renderAI = function () {
    const el = $('ai-mode');
    if (!window.AI) { el.textContent = ''; return; }
    if (AI.demo) {
      el.className = 'demo';
      el.innerHTML = 'демо-режим&nbsp;— нейросеть не&nbsp;подключена' + (AI.shot ? '' : '<button type="button" id="ai-on">подключить</button>');
      const b = $('ai-on');
      if (b) b.onclick = async () => { await AI.ensureKey(); UI.renderAI(); if (UI.cur >= 0) openCard(UI.cur, true); };
    } else {
      el.className = '';
      el.textContent = 'DeepSeek пишет жизни горожан';
    }
  };

  // ================================================================
  // Карточка жителя
  // ================================================================
  UI.cur = -1;
  let lastStatus = '', lastAgi = -1;
  function household(id) {
    const pop = LC.pop;
    const hh = pop.households[pop.hh[id]];
    const others = hh.members.filter((m) => m !== id);
    if (!others.length) return LC.g('живёт од{ин|на}', pop.sex[id]);
    const parts = others.map((o) => {
      const t = LC.relType(id, o);
      const lbl = t >= 0 ? LC.relLabel(t, pop.sex[o]) : (pop.sex[o] ? 'соседка по квартире' : 'сосед по квартире');
      return lbl + ' ' + LC.name(o, 'first');
    });
    return parts.join(', ');
  }
  UI.household = household;
  function shiftText(id) {
    const pop = LC.pop, P = D.professions[pop.prof[id]];
    if (P.at === 'none') return '';
    const s = pop.shiftS[id], e = pop.shiftE[id];
    const days = pop.workDays[id] === 0 ? 'по будням' : pop.workDays[id] === 1 ? 'два через два' : '';
    return LC.fmt(s) + '–' + LC.fmt(e) + (days ? ', ' + days : '');
  }
  UI.shiftText = shiftText;

  function openCard(id, force) {
    const pop = LC.pop, L = LC.life;
    if (UI.cur === id && !force) return;
    UI.cur = id;
    document.body.classList.add('has-card');
    const card = $('card');
    card.hidden = false;
    card.classList.remove('tall');
    $('card-scroll').scrollTop = 0;
    const female = pop.sex[id] === 1;
    $('p-name').textContent = LC.name(id, 'full');
    const wn = LC.workName(id);
    $('p-meta').innerHTML = nb(LC.ageWord(pop.age[id]) + ', ' + LC.profTitle(id) + (wn && wn !== 'дома' ? ' · ' + wn : ''));
    // факты
    const B = LC.city.buildings[pop.home[id]];
    const facts = [];
    facts.push(['Дом', B.address + ', кв. ' + pop.apt[id]]);
    facts.push(['Семья', household(id)]);
    const st = shiftText(id);
    if (st) facts.push(['График', st]);
    facts.push(['Характер', LC.traitWord(id, 0) + ', ' + LC.traitWord(id, 1)]);
    facts.push(['Увлечение', D.hobbies[pop.hobby[id]]]);
    if (pop.pet[id] >= 0) facts.push(['Питомец', D.pets[pop.pet[id]]]);
    facts.push(['На уме', LC.g(D.thoughts[pop.thought[id]].t, female)]);
    facts.push(['Мечта', D.dreams[pop.dream[id]]]);
    facts.push(['Никому не говорит', LC.g(D.secrets[pop.secret[id]].t, female)]);
    $('p-facts').innerHTML = facts.map(([k, v]) => '<dt>' + nb(k) + '</dt><dd>' + nb(v) + '</dd>').join('');
    // связи
    const rels = LC.relations(id);
    $('p-rels').innerHTML = rels.map((r) => '<button type="button" class="rel" data-id="' + r.id + '"><span><span class="rn">' + esc(r.name) + '</span><span class="rs" data-st="' + r.id + '"></span></span><span class="rt">' + esc(r.label) + '</span></button>').join('') || '<div class="thinking">Пока ни с кем не связан</div>';
    // разговор
    $('chat').innerHTML = '';
    $('say-in').value = '';
    $('p-why').hidden = !UI.why;
    if (UI.why) { $('p-why').innerHTML = nb(UI.why); UI.why = null; }
    lastStatus = ''; lastAgi = -1;
    refreshCard(true);
    // жизнь
    if (LC.brain) LC.brain.bio(id, $('p-bio'));
  }
  UI.openCard = openCard;

  function closeCard() {
    UI.cur = -1;
    $('card').hidden = true;
    document.body.classList.remove('has-card');
    if (LC.brain) LC.brain.stop();
  }
  UI.closeCard = closeCard;

  // обновление «сейчас», шкалы дня и статусов связей
  function refreshCard(full) {
    const id = UI.cur;
    if (id < 0) return;
    const L = LC.life;
    const s = L.status(id);
    const key = s.text + '|' + s.late;
    if (key !== lastStatus || full) {
      lastStatus = key;
      const el = $('p-now');
      el.className = 'now ' + (s.late ? 'late' : s.kind === 'in' ? 'in' : '');
      let txt = LC.cap(s.text);
      if (LC.actors && LC.actors.selected === id && LC.life.inB[id] === LC.pop.home[id] && LC.life.inV[id] < 0) {
        const w = LC.actors.aptWindow(id);
        if (w) txt += ', окно на ' + (w[1] + 1) + '-м этаже ' + (LC.life.act[id] === LC.A.SLEEP ? 'погашено' : 'горит');
      }
      el.innerHTML = '<span class="dot"></span><span>' + nb(txt) + (s.late ? '<span class="late-tag">опаздывает на ' + s.late + ' мин</span>' : '') + '</span>';
    }
    const agi = L.agi[id];
    if (agi !== lastAgi || full) { lastAgi = agi; renderAgenda(id); }
    else moveNowMark(id);
    // статусы связей — раз в секунду достаточно
    if (full || Math.random() < 0.25) {
      for (const el of document.querySelectorAll('#p-rels .rs')) {
        const o = +el.dataset.st;
        el.textContent = L.status(o).text;
      }
    }
  }

  // шкала суток с 04:00 до 04:00
  let agBase = 0;
  function renderAgenda(id) {
    const L = LC.life;
    const items = L.agendaText(id);
    const el = $('p-agenda');
    if (!items.length) { el.innerHTML = ''; return; }
    const d0 = Math.floor((items[0].s - 240) / 1440) * 1440 + 240;
    agBase = d0;
    const pct = (t) => LC.clamp(((t - d0) / 1440) * 100, 0, 100);
    let bar = '<div class="ag-bar">';
    for (const it of items) {
      const a = pct(it.s), b = pct(it.e);
      if (b <= a) continue;
      bar += '<div class="ag-seg" style="left:' + a.toFixed(2) + '%;width:' + (b - a).toFixed(2) + '%;background:' + ACT_COL[it.a] + '"></div>';
    }
    bar += '<div class="ag-now" id="ag-now"></div></div>';
    bar += '<div class="ag-hours"><span>04</span><span>08</span><span>12</span><span>16</span><span>20</span><span>00</span><span>04</span></div>';
    const cur = L.agi[id];
    let list = '<ul class="ag-list">';
    items.forEach((it, i) => {
      if (it.a === LC.A.HOME && it.e - it.s < 8) return;
      list += '<li' + (i === cur ? ' class="cur"' : '') + '><span class="t">' + LC.fmt(it.s) + '–' + LC.fmt(it.e) + '</span><span>' + nb(it.where) + '</span></li>';
    });
    list += '</ul>';
    el.innerHTML = bar + list;
    moveNowMark(id);
  }
  function moveNowMark() {
    const m = $('ag-now');
    if (!m) return;
    const p = LC.clamp(((LC.clock.t - agBase) / 1440) * 100, 0, 100);
    m.style.left = p.toFixed(2) + '%';
  }

  // клики в карточке
  $('card-x').addEventListener('click', () => { LC.select(-1); });
  $('p-rels').addEventListener('click', (e) => {
    const b = e.target.closest('.rel');
    if (b) LC.select(+b.dataset.id, { fly: true, dist: 70 });
  });
  document.querySelector('#card .grab').addEventListener('click', () => $('card').classList.toggle('tall'));
  $('say').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = $('say-in').value.trim();
    if (!t || UI.cur < 0 || !LC.brain) return;
    $('say-in').value = '';
    LC.brain.talk(UI.cur, t, $('chat'));
  });

  // ---------------- поиск ----------------
  $('search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('q').value.trim();
    if (!q || !LC.brain) return;
    $('q').blur();
    LC.brain.search(q);
  });
  for (const b of document.querySelectorAll('.tip')) b.addEventListener('click', () => { $('q').value = b.textContent.replace(/ /g, ' '); $('search').requestSubmit(); });
  UI.searchBusy = function (on) { $('q-go').disabled = !!on; $('q-go').textContent = on ? 'Ищу…' : 'Найти'; };

  // ---------------- газета ----------------
  $('paper-btn').addEventListener('click', () => { if (LC.brain) LC.brain.openPaper(); });
  $('paper-x').addEventListener('click', () => { $('paper').hidden = true; });
  $('paper').addEventListener('click', (e) => {
    if (e.target.id === 'paper') $('paper').hidden = true;
    const b = e.target.closest('.pname');
    if (b) { $('paper').hidden = true; LC.select(+b.dataset.id, { fly: true, dist: 70 }); }
  });

  // ---------------- клавиатура ----------------
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.key === ' ') { e.preventDefault(); setSpeed(LC.clock.paused ? LC.clock.speed || 1 : 0); }
    else if (e.key === 'Escape') { if (!$('paper').hidden) $('paper').hidden = true; else LC.select(-1); }
    else if (e.key === '1') setSpeed(1); else if (e.key === '2') setSpeed(4); else if (e.key === '3') setSpeed(15);
  });

  // ---------------- события мира ----------------
  LC.on('tick', tick);
  LC.on('select', (id) => { if (id < 0) closeCard(); else openCard(id); hideHint(); });
  let hintHidden = false;
  function hideHint() { if (!hintHidden) { hintHidden = true; $('hint').classList.add('gone'); } }
  if (window.__SHOT__) document.body.classList.add('shot');
  LC.on('started', () => {
    UI.renderAI();
    tick();
    if (LC.SHOT) $('veil').remove(); else setTimeout(() => $('veil').classList.add('gone'), 120);
    if (!LC.SHOT) setTimeout(hideHint, 22000);
  });
})(window.LC);
